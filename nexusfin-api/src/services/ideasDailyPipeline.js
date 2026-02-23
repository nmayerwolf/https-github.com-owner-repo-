const { randomUUID } = require('crypto');
const { createRegimeEngine } = require('./regimeEngine');
const { createConvictionEngine } = require('./convictionEngine');

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

  const reviewIdeas = async ({ date } = {}) => {
    const runDate = date || regimeEngine.artDate();
    const out = await safeQuery(
      query,
      `SELECT id, status, conviction_score, thesis, catalysts, risks, updated_at
       FROM ideas
       WHERE status IN ('active', 'monitoring')`
    );

    let reviewed = 0;
    let published = 0;

    for (const idea of out.rows || []) {
      const prev = {
        status: idea.status,
        conviction_score: toNum(idea.conviction_score, 50),
        high_conviction: toNum(idea.conviction_score, 50) >= 85
      };

      const scored = convictionEngine.scoreIdea({
        thesis: JSON.stringify(idea.thesis || {}),
        catalysts: JSON.stringify(idea.catalysts || []),
        risks: JSON.stringify(idea.risks || [])
      });

      const nextStatus = scored.total >= 60 ? 'active' : 'monitoring';
      const next = {
        status: nextStatus,
        conviction_score: scored.total,
        high_conviction: scored.total >= 85
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
             status = CASE WHEN status IN ('closed','invalidated') THEN status ELSE $3 END,
             updated_at = NOW()
         WHERE id = $1`,
        [idea.id, scored.total, nextStatus]
      );

      if (shouldPublish) {
        await safeQuery(query, `UPDATE ideas SET freshness_score = GREATEST(COALESCE(freshness_score, 50), 55) WHERE id = $1`, [idea.id]);
        published += 1;
      }

      reviewed += 1;
    }

    return { date: runDate, reviewed, published };
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
          id, tenant_id, created_by_user, title, summary, action, horizon, horizon_value, status, risk,
          conviction_score, quality_score, freshness_score, thesis, risks, catalysts, validation, valuation, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          COALESCE($1, (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1)),
          $2,
          $3,
          $4,
          'watch',
          'months',
          3,
          'active',
          'medium',
          $5,
          50,
          60,
          $6::jsonb,
          $7::jsonb,
          $8::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
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
      generatedAt: now
    };
  };

  return { generateDailyPackage, reviewIdeas, analyzePrompt, artDate: regimeEngine.artDate };
};

module.exports = { createIdeasDailyPipeline };
