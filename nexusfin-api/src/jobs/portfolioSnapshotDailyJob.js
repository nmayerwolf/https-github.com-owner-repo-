const { query } = require('../config/db');
const { withTrackedJobRun } = require('../services/jobRunTracker');
const portfolioSnapshotEngine = require('../engines/portfolioSnapshotEngine');
const portfolioMetricsEngine = require('../engines/portfolioMetricsEngine');
const { generatePortfolioNotes } = require('../engines/portfolioNotesEngine');
const { logAiUsage } = require('../services/aiUsageLogger');

const buildMap = (rows = [], key = 'symbol') =>
  Object.fromEntries(
    (rows || [])
      .map((row) => [String(row?.[key] || '').toUpperCase(), row])
      .filter(([mapKey]) => Boolean(mapKey))
  );

const loadLatestFundamentals = async () => {
  const columnsOut = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'fundamentals_snapshot'`
  );
  const cols = new Set((columnsOut.rows || []).map((row) => String(row.column_name || '').toLowerCase()));
  if (!cols.has('symbol')) return { rows: [] };

  const hasSector = cols.has('sector');
  const hasIndustry = cols.has('industry');
  const hasMarketCap = cols.has('market_cap');
  const dateExpr = cols.has('snapshot_date') ? 'snapshot_date' : cols.has('asof_date') ? 'asof_date' : 'CURRENT_DATE';

  const sql = `
    SELECT DISTINCT ON (symbol)
      symbol,
      ${hasSector ? 'sector' : 'NULL::text AS sector'},
      ${hasIndustry ? 'industry' : 'NULL::text AS industry'},
      ${hasMarketCap ? 'market_cap' : 'NULL::numeric AS market_cap'}
    FROM fundamentals_snapshot
    ORDER BY symbol, COALESCE(${dateExpr}, CURRENT_DATE) DESC NULLS LAST
  `;
  return query(sql);
};

const runCore = async (runDate) => {
  const [portfolios, bars, funds, regimeRow, metricsRows, universeRows] = await Promise.all([
    query(
      `SELECT p.id, p.user_id, p.name
       FROM portfolios p
       WHERE p.deleted_at IS NULL
         AND EXISTS (
           SELECT 1
           FROM positions pos
           WHERE pos.portfolio_id = p.id
             AND pos.sell_date IS NULL
             AND pos.deleted_at IS NULL
         )`
    ),
    query(
      `SELECT symbol, close, previous_close, change_pct
       FROM market_daily_bars
       WHERE COALESCE(bar_date, date) = $1`,
      [runDate]
    ),
    loadLatestFundamentals(),
    query(
      `SELECT regime, volatility_regime, leadership, confidence, risk_flags
       FROM regime_state
       WHERE COALESCE(state_date, date) = $1
       LIMIT 1`,
      [runDate]
    ),
    query(
      `SELECT symbol, sma_50
       FROM market_metrics_daily
       WHERE COALESCE(metric_date, date) = $1`,
      [runDate]
    ),
    query('SELECT symbol, COALESCE(category, asset_type, \'equity\') AS category FROM universe_symbols')
  ]);

  const priceMap = buildMap(bars.rows, 'symbol');
  const fundMap = buildMap(funds.rows, 'symbol');
  const metricsMap = buildMap(metricsRows.rows, 'symbol');
  const categoryMap = Object.fromEntries((universeRows.rows || []).map((row) => [String(row.symbol || '').toUpperCase(), String(row.category || 'equity')]));
  const regimeState = regimeRow.rows?.[0] || { regime: 'transition', volatility_regime: 'normal', leadership: [], confidence: 0.5, risk_flags: [] };

  let processed = 0;
  let failed = 0;

  for (const portfolio of portfolios.rows || []) {
    try {
      const holdingsRes = await query(
        `SELECT symbol, quantity AS qty, buy_price AS avg_cost, category
         FROM positions
         WHERE portfolio_id = $1
           AND sell_date IS NULL
           AND deleted_at IS NULL`,
        [portfolio.id]
      );
      const holdings = (holdingsRes.rows || []).map((row) => ({
        ...row,
        category: String(row.category || categoryMap[String(row.symbol || '').toUpperCase()] || 'equity').toLowerCase()
      }));
      if (!holdings.length) continue;

      const snapshot = portfolioSnapshotEngine.calculateSnapshot(holdings, priceMap, fundMap);

      const prevOut = await query(
        `SELECT total_value
         FROM portfolio_snapshots
         WHERE portfolio_id = $1
           AND COALESCE(snapshot_date, date) < $2
         ORDER BY COALESCE(snapshot_date, date) DESC
         LIMIT 1`,
        [portfolio.id, runDate]
      );
      const prevTotal = Number(prevOut.rows?.[0]?.total_value || snapshot.total_value);
      const pnlDay = Number((snapshot.total_value - prevTotal).toFixed(2));

      await query(
        `INSERT INTO portfolio_snapshots (
          portfolio_id, date, snapshot_date, total_value, total_cost, pnl_day, pnl_total, pnl_absolute, pnl_pct, holdings_detail, computed_at
        )
         VALUES ($1,$2,$2,$3,$4,$5,$6,$6,$7,$8::jsonb,NOW())
         ON CONFLICT (portfolio_id, date) DO UPDATE SET
           snapshot_date = EXCLUDED.snapshot_date,
           total_value = EXCLUDED.total_value,
           total_cost = EXCLUDED.total_cost,
           pnl_day = EXCLUDED.pnl_day,
           pnl_total = EXCLUDED.pnl_total,
           pnl_absolute = EXCLUDED.pnl_absolute,
           pnl_pct = EXCLUDED.pnl_pct,
           holdings_detail = EXCLUDED.holdings_detail,
           computed_at = NOW()`,
        [
          portfolio.id,
          runDate,
          snapshot.total_value,
          snapshot.total_cost,
          pnlDay,
          snapshot.pnl_absolute,
          snapshot.pnl_pct,
          JSON.stringify(snapshot.holdings_detail || [])
        ]
      );

      const [prevSnapshots, benchBars, profileOut] = await Promise.all([
        query(
          `SELECT total_value, COALESCE(snapshot_date, date) AS snapshot_date
           FROM portfolio_snapshots
           WHERE portfolio_id = $1
           ORDER BY COALESCE(snapshot_date, date) DESC
           LIMIT 20`,
          [portfolio.id]
        ),
        query(
          `SELECT close, COALESCE(bar_date, date) AS bar_date
           FROM market_daily_bars
           WHERE symbol = 'SPY'
           ORDER BY COALESCE(bar_date, date) DESC
           LIMIT 20`
        ),
        query('SELECT risk_level, horizon, focus FROM user_agent_profile WHERE user_id = $1 LIMIT 1', [portfolio.user_id])
      ]);

      const benchmark = portfolioMetricsEngine.calculateBenchmarkComparison(prevSnapshots.rows || [], benchBars.rows || []);
      const alignmentScore = portfolioMetricsEngine.calculateAlignmentScore(snapshot, regimeState, metricsMap);
      const exposure = portfolioMetricsEngine.calculateExposure(snapshot.holdings_detail || []);
      const concentration = portfolioMetricsEngine.calculateConcentration(snapshot.holdings_detail || []);
      const volatility20d = portfolioMetricsEngine.calculateVolatility20d(prevSnapshots.rows || []);

      const profile = profileOut.rows?.[0] || { risk_level: 0.5, horizon: 0.5, focus: 0.5 };
      const notesOut = await generatePortfolioNotes(
        snapshot,
        {
          alignment_score: alignmentScore,
          category_exposure: exposure.category_exposure,
          sector_exposure: exposure.sector_exposure,
          concentration_top3_pct: concentration
        },
        regimeState,
        profile
      );

      await logAiUsage({
        query,
        userId: portfolio.user_id,
        feature: 'portfolio_notes',
        model: notesOut.model,
        usage: notesOut.usage,
        success: notesOut.mode === 'ai',
        durationMs: notesOut.durationMs || 0
      });

      await query(
        `INSERT INTO portfolio_metrics (
          portfolio_id, date, metric_date, alignment_score, benchmark_symbol, benchmark_pnl_pct,
          portfolio_pnl_pct, alpha, volatility_20d, sector_exposure, category_exposure, concentration_top3_pct,
          concentration, ai_notes, raw, computed_at
        )
         VALUES ($1,$2,$2,$3,'SPY',$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12::jsonb,$13::jsonb,NOW())
         ON CONFLICT (portfolio_id, date) DO UPDATE SET
           metric_date = EXCLUDED.metric_date,
           alignment_score = EXCLUDED.alignment_score,
           benchmark_symbol = EXCLUDED.benchmark_symbol,
           benchmark_pnl_pct = EXCLUDED.benchmark_pnl_pct,
           portfolio_pnl_pct = EXCLUDED.portfolio_pnl_pct,
           alpha = EXCLUDED.alpha,
           volatility_20d = EXCLUDED.volatility_20d,
           sector_exposure = EXCLUDED.sector_exposure,
           category_exposure = EXCLUDED.category_exposure,
           concentration_top3_pct = EXCLUDED.concentration_top3_pct,
           concentration = EXCLUDED.concentration,
           ai_notes = EXCLUDED.ai_notes,
           raw = EXCLUDED.raw,
           computed_at = NOW()`,
        [
          portfolio.id,
          runDate,
          alignmentScore,
          benchmark.benchmark_pnl_pct,
          benchmark.portfolio_pnl_pct,
          benchmark.alpha,
          volatility20d,
          JSON.stringify(exposure.sector_exposure || {}),
          JSON.stringify(exposure.category_exposure || {}),
          concentration,
          JSON.stringify({ top3_pct: concentration }),
          JSON.stringify(notesOut.notes || []),
          JSON.stringify({
            regime: regimeState.regime,
            volatility_regime: regimeState.volatility_regime,
            leadership: Array.isArray(regimeState.leadership) ? regimeState.leadership : []
          })
        ]
      );

      processed += 1;
    } catch (error) {
      failed += 1;
      console.error(`[job:portfolio_snapshot_daily] portfolio ${portfolio.id} failed:`, error?.message || error);
    }
  }

  return { generated: processed, processed, failed, date: runDate };
};

const run = async ({ date = null } = {}) =>
  withTrackedJobRun({
    query,
    jobName: 'portfolio_snapshot_daily',
    date,
    run: runCore
  });

module.exports = { run, runCore };
