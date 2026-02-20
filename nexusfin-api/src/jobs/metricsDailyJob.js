const { query } = require('../config/db');
const { withTrackedJobRun } = require('../services/jobRunTracker');
const { calculateMetrics } = require('../engines/metricsEngine');

const toDateKey = (row) => String(row?.bar_date || row?.date || '');

const readActiveSymbols = async () => {
  const out = await query(
    `SELECT symbol
     FROM universe_symbols
     WHERE COALESCE(active, is_active, true) = true
     ORDER BY symbol ASC`
  );
  return (out.rows || []).map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean);
};

const readBars = async (symbol) => {
  const out = await query(
    `SELECT symbol, COALESCE(bar_date, date) AS bar_date, high, low, close
     FROM market_daily_bars
     WHERE symbol = $1
     ORDER BY COALESCE(bar_date, date) DESC
     LIMIT 260`,
    [symbol]
  );
  return (out.rows || []).slice().reverse();
};

const upsertMetrics = async ({ symbol, metrics }) => {
  await query(
    `INSERT INTO market_metrics_daily (
      symbol, metric_date, date, sma_20, sma_50, sma_200, rsi_14, atr_14, volatility_20d, relative_strength, computed_at, ma20, ma50, vol_20d
    )
     VALUES ($1, CURRENT_DATE, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, NOW(), $2, $3, $7)
     ON CONFLICT (symbol, metric_date) DO UPDATE SET
       date = EXCLUDED.date,
       sma_20 = EXCLUDED.sma_20,
       sma_50 = EXCLUDED.sma_50,
       sma_200 = EXCLUDED.sma_200,
       rsi_14 = EXCLUDED.rsi_14,
       atr_14 = EXCLUDED.atr_14,
       volatility_20d = EXCLUDED.volatility_20d,
       relative_strength = EXCLUDED.relative_strength,
       ma20 = EXCLUDED.ma20,
       ma50 = EXCLUDED.ma50,
       vol_20d = EXCLUDED.vol_20d,
       computed_at = NOW()`,
    [
      symbol,
      metrics.sma_20,
      metrics.sma_50,
      metrics.sma_200,
      metrics.rsi_14,
      metrics.atr_14,
      metrics.volatility_20d,
      metrics.relative_strength
    ]
  );
};

const runCore = async () => {
  const symbols = await readActiveSymbols();
  const spyBars = await readBars('SPY');
  const spyCloseByDate = new Map(spyBars.map((row) => [toDateKey(row), Number(row.close)]));
  let computed = 0;

  for (const symbol of symbols) {
    const bars = await readBars(symbol);
    if (!bars.length) continue;
    const spyCloses = bars.map((row) => spyCloseByDate.get(toDateKey(row))).filter(Number.isFinite);
    const metrics = calculateMetrics({ bars, spyCloses });
    await upsertMetrics({ symbol, metrics });
    computed += 1;
  }

  return { symbols_computed: computed, total: symbols.length };
};

const run = async () =>
  withTrackedJobRun({
    query,
    jobName: 'metrics_daily',
    run: runCore
  });

module.exports = { run, runCore };
