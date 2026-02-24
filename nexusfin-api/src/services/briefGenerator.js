const { createRegimeEngine } = require('./regimeEngine');

const safeQuery = async (query, sql, params = [], fallback = { rows: [] }) => {
  try {
    return await query(sql, params);
  } catch {
    return fallback;
  }
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const createBriefGenerator = ({ query, logger = console }) => {
  const regimeEngine = createRegimeEngine({ query, logger, modelVersion: 'regime-v1' });

  const generateBrief = async ({ date } = {}) => {
    const runDate = date || regimeEngine.artDate();
    const regime = await regimeEngine.getSnapshot({ date: runDate });

    const alertOut = await safeQuery(
      query,
      `SELECT alert_type, title, narrative, numbers_json
       FROM daily_alerts
       WHERE date = $1
       LIMIT 1`,
      [runDate]
    );

    const alert = alertOut.rows?.[0] || null;
    const bullets = [
      `Régimen: ${regime.state} (confianza ${regime.confidence}/100).`,
      regime.narrative,
      alert ? `${alert.title}: ${String(alert.narrative || '').slice(0, 160)}` : 'Sin alertas materiales para hoy.'
    ].slice(0, 5);

    const highlightedAssets = await safeQuery(
      query,
      `SELECT a.ticker, a.name,
              COALESCE(s.narrative_exec, 'Movimiento destacado del día') AS what_happened,
              COALESCE(s.narrative_full, 'Impacta en la lectura de riesgo y posicionamiento temático.') AS why_it_matters,
              s.score
       FROM daily_asset_scores s
       JOIN assets a ON a.asset_id = s.asset_id
       WHERE s.date = $1
       ORDER BY s.score DESC
       LIMIT 10`,
      [runDate]
    );

    const payload = {
      date: runDate,
      generatedAt: new Date().toISOString(),
      mainParagraph: regime.narrative,
      bullets,
      highlightedAssets: toArray(highlightedAssets.rows).map((row) => ({
        ticker: row.ticker,
        name: row.name,
        whatHappened: row.what_happened,
        whyItMatters: row.why_it_matters,
        score: Number(row.score || 0)
      })),
      note: 'Contenido informativo. No constituye recomendación de inversión.'
    };

    await safeQuery(
      query,
      `INSERT INTO daily_packages (id, tenant_id, user_id, kind, as_of_date, generated_at, title, intro, market_context, metadata, created_at, updated_at)
       VALUES (gen_random_uuid(),
               COALESCE((SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), gen_random_uuid()),
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
       ON CONFLICT (tenant_id, user_id, kind, as_of_date)
       DO UPDATE SET generated_at = NOW(),
                     title = EXCLUDED.title,
                     intro = EXCLUDED.intro,
                     market_context = EXCLUDED.market_context,
                     metadata = EXCLUDED.metadata,
                     updated_at = NOW()`,
      [runDate, `Brief — ${runDate}`, payload.mainParagraph, JSON.stringify({ regime }), JSON.stringify({ source: 'briefGenerator-v1' })]
    );

    return payload;
  };

  const getBrief = async ({ date } = {}) => {
    const runDate = date || regimeEngine.artDate();
    return generateBrief({ date: runDate });
  };

  return { generateBrief, getBrief };
};

module.exports = { createBriefGenerator };
