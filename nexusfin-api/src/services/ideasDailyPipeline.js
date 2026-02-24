const { createRegimeEngine } = require('./regimeEngine');
const { createConvictionEngine } = require('./convictionEngine');
const { convictionFromScore, isActiveIdea, computePriorityScore } = require('./ideaLifecycle');

const safeQuery = async (query, sql, params = [], fallback = { rows: [] }) => {
  try {
    return await query(sql, params);
  } catch {
    return fallback;
  }
};

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const uniqueBy = (items, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const EVENT_KEYWORDS = ['earnings', 'guidance', 'regulatory', 'regulation', 'm&a', 'merger', 'acquisition'];

const extractIdeaSymbols = (idea, knownSymbols) => {
  const text = `${idea?.title || ''} ${idea?.summary || ''} ${JSON.stringify(idea?.thesis || {})} ${JSON.stringify(idea?.catalysts || [])} ${JSON.stringify(idea?.risks || [])}`.toUpperCase();
  const out = [];
  for (const symbol of knownSymbols) {
    if (text.includes(symbol)) out.push(symbol);
    if (out.length >= 6) break;
  }
  return out;
};

const createIdeasDailyPipeline = ({ query, logger = console, modelVersion = 'ideas-v1' }) => {
  const regimeEngine = createRegimeEngine({ query, logger, modelVersion: 'regime-v1' });
  const convictionEngine = createConvictionEngine();

  const buildThemeSections = async (date) => {
    const themesOut = await safeQuery(
      query,
      `SELECT theme_id, date::text AS date, score, bucket, direction, narrative, numbers_json, base_score, overlay_score, regime_multiplier, model_version
       FROM daily_theme_scores
       WHERE date = $1
       ORDER BY score DESC`,
      [date]
    );

    const sections = [];
    for (const row of themesOut.rows || []) {
      const rankedOut = await safeQuery(
        query,
        `SELECT r.rank, r.asset_score, a.asset_id, a.ticker, a.name, a.asset_type,
                s.components_json, s.narrative_exec, s.narrative_full, s.numbers_json
         FROM daily_theme_rankings r
         JOIN assets a ON a.asset_id = r.asset_id
         LEFT JOIN daily_asset_scores s ON s.asset_id = r.asset_id AND s.theme_id = r.theme_id AND s.date = r.date
         WHERE r.theme_id = $1 AND r.date = $2
         ORDER BY r.rank ASC
         LIMIT 4`,
        [row.theme_id, date]
      );

      sections.push({
        themeScore: {
          themeId: row.theme_id,
          date: row.date,
          score: toNum(row.score, 0),
          bucket: row.bucket,
          direction: row.direction,
          narrative: row.narrative,
          numbers: Array.isArray(row.numbers_json) ? row.numbers_json : [],
          baseScore: row.base_score != null ? toNum(row.base_score, 0) : null,
          overlayScore: row.overlay_score != null ? toNum(row.overlay_score, 0) : null,
          regimeMultiplier: row.regime_multiplier != null ? Number(row.regime_multiplier) : null,
          modelVersion: row.model_version || modelVersion
        },
        rankedAssets: (rankedOut.rows || []).map((assetRow) => ({
          asset: {
            assetId: assetRow.asset_id,
            ticker: assetRow.ticker,
            name: assetRow.name,
            type: String(assetRow.asset_type || '').toLowerCase()
          },
          themeId: row.theme_id,
          date,
          rank: toNum(assetRow.rank, 0),
          score: toNum(assetRow.asset_score, 0),
          componentScores: parseJson(assetRow.components_json, {}),
          keyNumbers: Array.isArray(assetRow.numbers_json) ? assetRow.numbers_json : [],
          execNarrative: assetRow.narrative_exec || '',
          risk: 'medium',
          fullNarrative: assetRow.narrative_full || '',
          modelVersion
        }))
      });
    }

    return sections;
  };

  const generateDailyPackage = async ({ date, userId = null } = {}) => {
    const runDate = date || regimeEngine.artDate();
    const regime = await regimeEngine.getSnapshot({ date: runDate });
    const themes = await buildThemeSections(runDate);

    const alertOut = await safeQuery(
      query,
      `SELECT alert_type, title, narrative, numbers_json
       FROM daily_alerts
       WHERE date = $1
       LIMIT 1`,
      [runDate]
    );
    const dailyAlertRow = alertOut.rows?.[0] || null;

    const packageJson = {
      date: runDate,
      regime,
      themes,
      dailyAlert: dailyAlertRow
        ? {
            type: dailyAlertRow.alert_type,
            title: dailyAlertRow.title,
            narrative: dailyAlertRow.narrative,
            numbers: Array.isArray(dailyAlertRow.numbers_json) ? dailyAlertRow.numbers_json : []
          }
        : null
    };

    await safeQuery(
      query,
      `INSERT INTO daily_packages (id, tenant_id, user_id, kind, as_of_date, generated_at, title, intro, market_context, metadata, created_at, updated_at)
       VALUES (gen_random_uuid(),
               COALESCE((SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), gen_random_uuid()),
               $1,
               'ideas_daily',
               $2,
               NOW(),
               $3,
               $4,
               $5::jsonb,
               $6::jsonb,
               NOW(),
               NOW())
       ON CONFLICT (tenant_id, user_id, kind, as_of_date)
       DO UPDATE SET generated_at = NOW(),
                     title = EXCLUDED.title,
                     intro = EXCLUDED.intro,
                     market_context = EXCLUDED.market_context,
                     metadata = EXCLUDED.metadata,
                     updated_at = NOW()`,
      [
        userId,
        runDate,
        `Ideas — ${runDate}`,
        regime.narrative,
        JSON.stringify({ regime, themesCount: themes.length }),
        JSON.stringify({ modelVersion })
      ]
    );

    return packageJson;
  };

  const reviewIdeas = async ({ date, runDate: explicitRunDate, runId = null } = {}) => {
    const runDate = explicitRunDate || date || regimeEngine.artDate();
    const assetsOut = await safeQuery(query, `SELECT asset_id, ticker FROM assets WHERE is_active = TRUE`, [], { rows: [] });
    const symbolToAssetId = new Map((assetsOut.rows || []).map((row) => [String(row.ticker || '').toUpperCase(), String(row.asset_id)]));
    const knownSymbols = Array.from(symbolToAssetId.keys()).filter(Boolean);

    const snapshotsOut = await safeQuery(
      query,
      `SELECT DISTINCT ON (asset_id) asset_id, change_pct, ts
       FROM market_snapshots
       ORDER BY asset_id, ts DESC`,
      [],
      { rows: [] }
    );
    const latestChangeByAssetId = new Map((snapshotsOut.rows || []).map((row) => [String(row.asset_id), toNum(row.change_pct, null)]));

    const fundOut = await safeQuery(
      query,
      `WITH ranked AS (
         SELECT asset_id, as_of, revenue_ttm, operating_margin_ttm, pe_ttm,
                ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY as_of DESC) AS rn
         FROM fundamentals
       )
       SELECT asset_id, as_of, revenue_ttm, operating_margin_ttm, pe_ttm, rn
       FROM ranked
       WHERE rn <= 2`,
      [],
      { rows: [] }
    );
    const fundByAssetId = new Map();
    for (const row of fundOut.rows || []) {
      const key = String(row.asset_id);
      if (!fundByAssetId.has(key)) fundByAssetId.set(key, []);
      fundByAssetId.get(key).push(row);
    }

    const newsOut = await safeQuery(
      query,
      `SELECT title, description, related_assets
       FROM news_items
       WHERE published_at >= NOW() - INTERVAL '48 hours'
       ORDER BY published_at DESC
       LIMIT 500`,
      [],
      { rows: [] }
    );

    const out = await safeQuery(
      query,
      `SELECT id, title, summary, status, conviction_score, quality_score, freshness_score, thesis, catalysts, risks, updated_at,
              COALESCE(initial_conviction, CASE WHEN conviction_score >= 85 THEN 'HIGH' WHEN conviction_score >= 65 THEN 'MEDIUM' ELSE 'LOW' END) AS initial_conviction,
              COALESCE(current_conviction, CASE WHEN conviction_score >= 85 THEN 'HIGH' WHEN conviction_score >= 65 THEN 'MEDIUM' ELSE 'LOW' END) AS current_conviction,
              COALESCE(thesis_broken, FALSE) AS thesis_broken
       FROM ideas`
    );

    let reviewed = 0;
    let published = 0;
    let revised = 0;
    let triggered = 0;

    for (const idea of out.rows || []) {
      const symbols = extractIdeaSymbols(idea, knownSymbols);
      const relatedAssetIds = uniqueBy(
        symbols.map((symbol) => symbolToAssetId.get(symbol)).filter(Boolean),
        (id) => id
      );

      const priceTriggered = relatedAssetIds.some((assetId) => {
        const move = toNum(latestChangeByAssetId.get(assetId), null);
        if (move == null) return false;
        return Math.abs(move) >= 3;
      });

      const fundamentalsTriggered = relatedAssetIds.some((assetId) => {
        const fundRows = fundByAssetId.get(assetId) || [];
        const latest = fundRows.find((row) => Number(row.rn) === 1);
        const prevFund = fundRows.find((row) => Number(row.rn) === 2);
        if (!latest || !prevFund) return false; // missing metrics -> no trigger

        const revLatest = toNum(latest.revenue_ttm, null);
        const revPrev = toNum(prevFund.revenue_ttm, null);
        const opLatest = toNum(latest.operating_margin_ttm, null);
        const opPrev = toNum(prevFund.operating_margin_ttm, null);
        const peLatest = toNum(latest.pe_ttm, null);
        const pePrev = toNum(prevFund.pe_ttm, null);

        const revenueDeltaPct =
          revLatest != null && revPrev != null && revPrev !== 0 ? Math.abs(((revLatest - revPrev) / Math.abs(revPrev)) * 100) : null;
        const marginDeltaAbs = opLatest != null && opPrev != null ? Math.abs(opLatest - opPrev) : null;
        const peDeltaPct = peLatest != null && pePrev != null && pePrev !== 0 ? Math.abs(((peLatest - pePrev) / Math.abs(pePrev)) * 100) : null;

        return Boolean(
          (revenueDeltaPct != null && revenueDeltaPct >= 7) ||
            (marginDeltaAbs != null && marginDeltaAbs >= 0.03) ||
            (peDeltaPct != null && peDeltaPct >= 20)
        );
      });

      const eventTriggered = (newsOut.rows || []).some((row) => {
        const related = Array.isArray(row.related_assets) ? row.related_assets : parseJson(row.related_assets, []);
        const touchesIdea = (related || []).some((item) => symbols.includes(String(item?.symbol || '').toUpperCase()));
        if (!touchesIdea) return false;
        const text = `${String(row.title || '')} ${String(row.description || '')}`.toLowerCase();
        return EVENT_KEYWORDS.some((k) => text.includes(k));
      });

      const shouldReassess = priceTriggered || fundamentalsTriggered || eventTriggered;
      if (!shouldReassess) {
        reviewed += 1;
        continue;
      }
      triggered += 1;

      const prevStatus = String(idea.status || 'Initiated');
      const prevConviction = String(idea.current_conviction || convictionFromScore(idea.conviction_score));
      const prev = {
        status: prevStatus,
        conviction_score: toNum(idea.conviction_score, 50),
        high_conviction: toNum(idea.conviction_score, 50) >= 85
      };

      const scored = convictionEngine.scoreIdea({
        thesis: JSON.stringify(idea.thesis || {}),
        catalysts: JSON.stringify(idea.catalysts || []),
        risks: JSON.stringify(idea.risks || [])
      });

      const computedConviction = convictionFromScore(scored.total);
      const nextStatus = scored.total >= 75 ? 'Reinforced' : scored.total >= 55 ? 'Initiated' : 'Under Review';
      const next = {
        status: nextStatus,
        conviction_score: scored.total,
        high_conviction: computedConviction === 'HIGH'
      };

      const shouldPublish = convictionEngine.shouldPublishUpdate(prev, next, {
        catalysts: JSON.stringify(idea.catalysts || []),
        risks: JSON.stringify(idea.risks || [])
      }, {
        catalysts: JSON.stringify(idea.catalysts || []),
        risks: JSON.stringify(idea.risks || [])
      });

      await safeQuery(
        query,
        `UPDATE ideas
         SET conviction_score = $2,
             current_conviction = $3,
             status = CASE WHEN status IN ('closed','invalidated') THEN status ELSE $4 END,
             priority_score = $5,
             last_conviction_change_reason = $6,
             error_type = CASE WHEN $7 < 45 THEN 'Thesis Drift' ELSE NULL END,
             thesis_broken = CASE WHEN $7 < 35 THEN TRUE ELSE COALESCE(thesis_broken, FALSE) END,
             updated_at = NOW()
         WHERE id = $1`,
        [
          idea.id,
          scored.total,
          computedConviction,
          nextStatus,
          computePriorityScore({
            ...idea,
            conviction_score: scored.total,
            current_conviction: computedConviction
          }),
          scored.total >= 75 ? 'Validación diaria reforzada' : scored.total >= 55 ? 'Validación diaria estable' : 'Convicción reducida por señales mixtas',
          scored.total
        ]
      );

      if (runId && (prevStatus !== nextStatus || prevConviction !== computedConviction)) {
        await safeQuery(
          query,
          `INSERT INTO idea_revisions (idea_id, run_id, previous_conviction, new_conviction, previous_status, new_status, change_reason, error_type, created_at)
           VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            idea.id,
            runId,
            prevConviction,
            computedConviction,
            prevStatus,
            nextStatus,
            scored.total >= 75 ? 'Review reforzó tesis' : scored.total >= 55 ? 'Review mantuvo tesis' : 'Review detectó deterioro',
            scored.total < 45 ? 'Thesis Drift' : null
          ]
        );
        revised += 1;
      }

      if (shouldPublish) {
        await safeQuery(query, `UPDATE ideas SET freshness_score = GREATEST(COALESCE(freshness_score, 50), 55) WHERE id = $1`, [idea.id]);
        published += 1;
      }

      reviewed += 1;
    }

    const activeOut = await safeQuery(
      query,
      `SELECT id, status, current_conviction, thesis_broken, priority_score, conviction_score, quality_score, freshness_score
       FROM ideas
       ORDER BY COALESCE(priority_score, 0) DESC, updated_at DESC`
    );
    const activeIdeas = (activeOut.rows || []).filter((row) => isActiveIdea(row));
    if (activeIdeas.length > 10) {
      const replacements = activeIdeas
        .filter((row) => String(row.current_conviction || '').toUpperCase() !== 'HIGH')
        .sort((a, b) => Number(a.priority_score || 0) - Number(b.priority_score || 0));

      const overflow = activeIdeas.length - 10;
      const toClose = replacements.slice(0, overflow);
      for (const row of toClose) {
        await safeQuery(query, `UPDATE ideas SET status = 'closed', updated_at = NOW() WHERE id = $1`, [row.id]);
        if (runId) {
          await safeQuery(
            query,
            `INSERT INTO idea_revisions (idea_id, run_id, previous_conviction, new_conviction, previous_status, new_status, change_reason, error_type, created_at)
             VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, NOW())`,
            [
              row.id,
              runId,
              String(row.current_conviction || convictionFromScore(row.conviction_score)),
              String(row.current_conviction || convictionFromScore(row.conviction_score)),
              String(row.status || ''),
              'closed',
              'Cap de 10 ideas activas aplicado',
              null
            ]
          );
        }
      }
    }

    return { date: runDate, runId, reviewed, triggered, published, revised };
  };

  const analyzePrompt = async ({ prompt, userId, tenantId } = {}) => {
    const scored = convictionEngine.scoreIdea({
      thesis: prompt,
      fundamentals: prompt,
      catalyst: prompt,
      dislocation: prompt,
      risks: prompt,
      plan: { entry: prompt, exits: prompt }
    });

    const qualifies = scored.total >= 60;
    const now = new Date().toISOString();
    const idea = {
      qualifiesAsActiveIdea: qualifies,
      convictionScore: scored.total,
      breakdown: scored.breakdown,
      rationale: scored.rationale,
      sources: scored.keySources,
      structured: {
        thesis: { whyNow: prompt, edge: 'Evaluación placeholder', whatMustBeTrue: 'Validar con próximos datos' },
        fundamentals: prompt,
        catalyst: prompt,
        dislocation: prompt,
        risks: ['Evidencia aún preliminar'],
        entry: { levels: [] },
        exits: { targets: [] },
        sizing: { mode: 'conservative' }
      }
    };

    if (qualifies) {
      const inserted = await safeQuery(
        query,
        `INSERT INTO ideas (
          id, tenant_id, created_by_user, title, summary, action, horizon, horizon_value, risk,
          conviction_score, quality_score, freshness_score, thesis, risks, catalysts, validation, valuation,
          initial_conviction, thesis_broken,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          COALESCE($1, (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1)),
          $2,
          $3,
          $4,
          'watch',
          'months',
          3,
          'medium',
          $5,
          50,
          60,
          $6::jsonb,
          $7::jsonb,
          $8::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          CASE WHEN $5 >= 85 THEN 'HIGH' WHEN $5 >= 65 THEN 'MEDIUM' ELSE 'LOW' END,
          FALSE,
          NOW(),
          NOW()
        ) RETURNING id, status, conviction_score`,
        [tenantId || null, userId || null, 'Idea desde Ask Horsai', 'Análisis generado on-demand', scored.total, JSON.stringify(idea.structured.thesis), JSON.stringify(idea.structured.risks), JSON.stringify([idea.structured.catalyst])]
      );
      idea.ideaId = inserted.rows?.[0]?.id || null;
    }

    await safeQuery(
      query,
      `INSERT INTO chats (id, tenant_id, user_id, topic, created_at)
       VALUES (gen_random_uuid(), COALESCE($1, (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1)), $2, 'ideas', NOW())`,
      [tenantId || null, userId || null]
    );

    return {
      ...idea,
      message: `Qualifies as Active Idea: ${qualifies ? 'YES' : 'NO'}`,
      officialStatePolicy: 'Las actualizaciones oficiales de conviction/status se aplican solo en review_ideas del próximo daily run.',
      generatedAt: now
    };
  };

  return { generateDailyPackage, reviewIdeas, analyzePrompt, artDate: regimeEngine.artDate };
};

module.exports = { createIdeasDailyPipeline };
