const { createRegimeEngine } = require('./regimeEngine');

const safeQuery = async (query, sql, params = [], fallback = { rows: [] }) => {
  try {
    return await query(sql, params);
  } catch {
    return fallback;
  }
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

const createBriefGenerator = ({ query, logger = console }) => {
  const regimeEngine = createRegimeEngine({ query, logger, modelVersion: 'regime-v1' });
  const fallbackThemes = [
    'Macro & Rates',
    'Earnings Quality',
    'AI & Semis',
    'Cloud & Software',
    'Financials',
    'Energy',
    'Healthcare',
    'Industrials',
    'Consumer',
    'Crypto & Risk Appetite'
  ];

  const createRun = async (date, externalRunId = null) => {
    const out = await safeQuery(
      query,
      `INSERT INTO runs (run_kind, status, config)
       VALUES ('generate_brief', 'running', $1::jsonb)
       RETURNING run_id`,
      [JSON.stringify({ date, externalRunId })],
      { rows: [] }
    );
    return out.rows?.[0]?.run_id || null;
  };

  const finishRun = async (runId, status, errorMessage = null) => {
    if (!runId) return;
    await safeQuery(query, `UPDATE runs SET status = $2, error_message = $3, finished_at = NOW() WHERE run_id = $1`, [runId, status, errorMessage]);
  };

  const persistRadarSnapshot = async ({ runId, runDate, regime }) => {
    if (!runId) return [];
    const radarOut = await safeQuery(
      query,
      `SELECT theme_id, score, bucket, direction, narrative
       FROM daily_theme_scores
       WHERE date = $1::date
       ORDER BY score DESC
       LIMIT 10`,
      [runDate]
    );

    let radar = (radarOut.rows || []).map((row, index) => ({
      rank: index + 1,
      themeId: row.theme_id,
      score: Number(row.score || 0),
      bucket: row.bucket,
      direction: row.direction,
      narrative: row.narrative
    }));

    if (radar.length < 10) {
      const filled = [...radar];
      const existing = new Set(filled.map((item) => String(item.themeId)));
      for (const theme of fallbackThemes) {
        if (filled.length >= 10) break;
        if (existing.has(theme)) continue;
        filled.push({
          rank: filled.length + 1,
          themeId: theme,
          score: 50,
          bucket: 'NEUTRAL',
          direction: 'FLAT',
          narrative: 'Data missing: sin score cuantitativo para este tema en el run actual.'
        });
      }
      radar = filled.slice(0, 10).map((item, idx) => ({ ...item, rank: idx + 1 }));
    }

    await safeQuery(
      query,
      `INSERT INTO radar_snapshots (run_id, run_date, radar_json, regime_bias, created_at)
       VALUES ($1::uuid, $2::date, $3::jsonb, $4, NOW())`,
      [runId, runDate, JSON.stringify(radar), String(regime?.label || regime?.state || 'Neutral')]
    );

    return radar;
  };

  const resolveTenantId = async () => {
    const existing = await safeQuery(
      query,
      `SELECT id
       FROM tenants
       ORDER BY created_at ASC
       LIMIT 1`,
      [],
      { rows: [] }
    );
    if (existing.rows?.[0]?.id) return existing.rows[0].id;

    const created = await safeQuery(
      query,
      `INSERT INTO tenants (id, name, plan, created_at, updated_at)
       VALUES (gen_random_uuid(), 'System Tenant', 'plus', NOW(), NOW())
       RETURNING id`,
      [],
      { rows: [] }
    );
    return created.rows?.[0]?.id || null;
  };

  const generateBrief = async ({ date, runId: incomingRunId } = {}) => {
    const runDate = date || regimeEngine.artDate();
    const internalRunId = await createRun(runDate, incomingRunId || null);
    const runId = incomingRunId || internalRunId;

    try {
      const regime = await regimeEngine.getSnapshot({ date: runDate });
      const tenantId = await resolveTenantId();
      if (!tenantId) throw new Error('TENANT_RESOLUTION_FAILED');
      const newsOut = await safeQuery(
        query,
        `SELECT news_id, title, description, source_name, url, relevance_score, related_assets, published_at
         FROM news_items
         WHERE published_at >= ($1::date + time '00:00') - INTERVAL '48 hours'
           AND published_at <  ($1::date + INTERVAL '1 day')
         ORDER BY relevance_score DESC NULLS LAST, published_at DESC
         LIMIT 10`,
        [runDate]
      );

      const topNews = (newsOut.rows || []).slice(0, 5);
      const bullets = topNews.map((row) => {
        const headline = String(row.title || '').trim();
        const why = String(row.description || 'Impacta en riesgo, flujo y convicción de ideas activas.').trim();
        const tags = [];
        const lower = `${headline} ${why}`.toLowerCase();
        if (lower.includes('fed') || lower.includes('cpi') || lower.includes('rates')) tags.push('macro');
        if (lower.includes('earnings')) tags.push('earnings');
        if (lower.includes('ai')) tags.push('ai');
        if (!tags.length) tags.push('market');

        const relatedAssets = parseJson(row.related_assets, []);
        return {
          headline,
          whyItMatters: why,
          tags,
          evidenceLinks: [{ title: headline, url: row.url, sourceName: row.source_name || undefined }],
          marketContext: {
            symbol: relatedAssets?.[0]?.symbol || null,
            publishedAt: row.published_at || null
          }
        };
      });

      const payload = {
        date: runDate,
        generatedAt: new Date().toISOString(),
        mainParagraph: regime.narrative,
        bullets: bullets.map((item) => item.headline),
        briefBullets: bullets,
        highlightedAssets: [],
        note: 'Contenido informativo. No constituye recomendación de inversión.'
      };
      const radar = await persistRadarSnapshot({ runId, runDate, regime });
      const dailyPackagePayload = {
        kind: 'brief_daily',
        date: runDate,
        generatedAt: new Date().toISOString(),
        title: `Brief — ${runDate}`,
        intro: payload.mainParagraph,
        regime,
        marketRadar: radar,
        briefBullets: bullets,
        note: payload.note,
        source: 'briefGenerator-v1',
        runId
      };

      if (runId) {
        for (const item of bullets) {
          await safeQuery(
            query,
            `INSERT INTO brief_bullets (run_id, headline, why_it_matters, tags, evidence_links, market_context)
             VALUES ($1, $2, $3, $4::text[], $5::jsonb, $6::jsonb)`,
            [
              runId,
              item.headline,
              item.whyItMatters,
              item.tags,
              JSON.stringify(item.evidenceLinks || []),
              JSON.stringify(item.marketContext || {})
            ]
          );
        }
      }

      await safeQuery(
        query,
        `INSERT INTO daily_packages (id, tenant_id, user_id, kind, as_of_date, generated_at, title, intro, market_context, metadata, created_at, updated_at)
         VALUES (gen_random_uuid(),
                 $6,
                 NULL,
                 'brief_daily',
                 $1,
                 NOW(),
                 $2,
                 $3,
                 $4::jsonb,
                 $5::jsonb,
                 NOW(),
                 NOW())
         ON CONFLICT (tenant_id, (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)), kind, as_of_date) WHERE kind = 'brief_daily'
         DO UPDATE SET generated_at = NOW(),
                       title = EXCLUDED.title,
                       intro = EXCLUDED.intro,
                       market_context = EXCLUDED.market_context,
                       metadata = EXCLUDED.metadata,
                       updated_at = NOW()`,
        [runDate, dailyPackagePayload.title, dailyPackagePayload.intro, JSON.stringify({ regime }), JSON.stringify(dailyPackagePayload), tenantId]
      );

      await finishRun(internalRunId, 'success');
      return dailyPackagePayload;
    } catch (error) {
      await finishRun(internalRunId, 'failed', String(error?.message || error));
      throw error;
    }
  };

  const getBrief = async ({ date, force = false } = {}) => {
    const runDate = date || regimeEngine.artDate();
    if (!force) {
      const cached = await safeQuery(
        query,
        `SELECT metadata
         FROM daily_packages
         WHERE kind = 'brief_daily' AND as_of_date = $1::date
         ORDER BY generated_at DESC
         LIMIT 1`,
        [runDate],
        { rows: [] }
      );
      const meta = cached.rows?.[0]?.metadata;
      const parsed = parseJson(meta, null);
      if (parsed?.date === runDate && Array.isArray(parsed?.briefBullets) && parsed.briefBullets.length) return parsed;
    }
    return generateBrief({ date: runDate });
  };

  return { generateBrief, getBrief, artDate: regimeEngine.artDate };
};

module.exports = { createBriefGenerator };
