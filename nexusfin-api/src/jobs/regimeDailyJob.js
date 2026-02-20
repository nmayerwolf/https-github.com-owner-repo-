const { query } = require('../config/db');
const { withTrackedJobRun } = require('../services/jobRunTracker');
const { detectRegime } = require('../engines/regimeEngine');

const readSpySnapshot = async () => {
  const out = await query(
    `SELECT
       b.close,
       m.sma_50,
       m.sma_200,
       m.rsi_14,
       m.volatility_20d
     FROM market_daily_bars b
     JOIN market_metrics_daily m
       ON m.symbol = b.symbol
      AND COALESCE(m.metric_date, m.date) = COALESCE(b.bar_date, b.date)
     WHERE b.symbol = 'SPY'
       AND COALESCE(b.bar_date, b.date) = CURRENT_DATE
     LIMIT 1`
  );
  return out.rows?.[0] || null;
};

const readBreadth = async () => {
  const out = await query(
    `SELECT
       SUM(CASE WHEN b.close > m.sma_50 THEN 1 ELSE 0 END)::float AS advancing,
       COUNT(*)::float AS total
     FROM market_daily_bars b
     JOIN market_metrics_daily m
       ON m.symbol = b.symbol
      AND COALESCE(m.metric_date, m.date) = COALESCE(b.bar_date, b.date)
     JOIN universe_symbols u ON u.symbol = b.symbol
     WHERE COALESCE(b.bar_date, b.date) = CURRENT_DATE
       AND LOWER(COALESCE(u.category, u.asset_type, 'equity')) = 'equity'
       AND m.sma_50 IS NOT NULL`
  );
  const row = out.rows?.[0] || {};
  const advancing = Number(row.advancing || 0);
  const total = Number(row.total || 0);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return advancing / total;
};

const readSectorPerf20d = async () => {
  const out = await query(
    `WITH ranked AS (
      SELECT
        b.symbol,
        COALESCE(b.bar_date, b.date) AS d,
        b.close,
        ROW_NUMBER() OVER (PARTITION BY b.symbol ORDER BY COALESCE(b.bar_date, b.date) DESC) AS rn
      FROM market_daily_bars b
      JOIN universe_symbols u ON u.symbol = b.symbol
      WHERE COALESCE(u.active, u.is_active, true) = true
    ),
    pivot AS (
      SELECT
        symbol,
        MAX(CASE WHEN rn = 1 THEN close END) AS close_latest,
        MAX(CASE WHEN rn = 21 THEN close END) AS close_20d
      FROM ranked
      WHERE rn IN (1, 21)
      GROUP BY symbol
    )
    SELECT
      LOWER(COALESCE(u.category, u.asset_type, 'equity')) AS category,
      AVG((p.close_latest - p.close_20d) / NULLIF(p.close_20d, 0)) AS perf20d
    FROM pivot p
    JOIN universe_symbols u ON u.symbol = p.symbol
    WHERE p.close_latest IS NOT NULL
      AND p.close_20d IS NOT NULL
    GROUP BY 1`
  );
  return (out.rows || []).map((row) => ({
    category: String(row.category || '').toLowerCase(),
    perf20d: Number(row.perf20d || 0)
  }));
};

const runCore = async () => {
  const spy = await readSpySnapshot();
  if (!spy) {
    throw new Error('SPY data missing for CURRENT_DATE');
  }
  const breadth = await readBreadth();
  const sectorPerf = await readSectorPerf20d();
  const result = detectRegime({ spy, vix: null, breadth, sectorPerf });

  await query(
    `INSERT INTO regime_state (
      state_date, date, regime, volatility_regime, leadership, macro_drivers, risk_flags, confidence, computed_at
    )
     VALUES (CURRENT_DATE, CURRENT_DATE, $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, NOW())
     ON CONFLICT (state_date) DO UPDATE SET
       date = EXCLUDED.date,
       regime = EXCLUDED.regime,
       volatility_regime = EXCLUDED.volatility_regime,
       leadership = EXCLUDED.leadership,
       macro_drivers = EXCLUDED.macro_drivers,
       risk_flags = EXCLUDED.risk_flags,
       confidence = EXCLUDED.confidence,
       computed_at = NOW()`,
    [
      result.regime,
      result.volatility_regime,
      JSON.stringify(result.leadership || []),
      JSON.stringify(result.macro_drivers || []),
      JSON.stringify(result.risk_flags || []),
      result.confidence
    ]
  );

  return { regime: result.regime, confidence: result.confidence, volatility_regime: result.volatility_regime };
};

const run = async () =>
  withTrackedJobRun({
    query,
    jobName: 'regime_daily',
    run: runCore
  });

module.exports = { run, runCore };
