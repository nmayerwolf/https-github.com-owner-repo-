const { query } = require('../config/db');
const finnhub = require('../services/finnhub');
const { withTrackedJobRun } = require('../services/jobRunTracker');

const toNum = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const runCore = async (runDate) => {
  const symbolsOut = await query(
    `SELECT symbol
     FROM universe_symbols
     WHERE COALESCE(is_active, active, true) = true
       AND LOWER(COALESCE(asset_type, category, 'equity')) = 'equity'
     ORDER BY symbol ASC`
  );
  const symbols = (symbolsOut.rows || []).map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean);

  let upserted = 0;
  for (const symbol of symbols) {
    const [profile, basic] = await Promise.all([
      finnhub.profile(symbol).catch(() => null),
      finnhub.basicFinancials(symbol).catch(() => null)
    ]);

    const metric = basic?.metric || {};
    const pe = toNum(metric.peTTM);
    const evEbitda = toNum(metric.currentEvFreeCashFlowTTM);
    const fcfYield = toNum(metric.freeCashFlowPerShareTTM) && toNum(metric.currentEvFreeCashFlowTTM)
      ? null
      : toNum(metric.freeCashFlowYieldTTM);

    await query(
      `INSERT INTO fundamentals_snapshot (symbol, asof_date, pe, ev_ebitda, fcf_yield, raw, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW())
       ON CONFLICT (symbol, asof_date)
       DO UPDATE SET
         pe = EXCLUDED.pe,
         ev_ebitda = EXCLUDED.ev_ebitda,
         fcf_yield = EXCLUDED.fcf_yield,
         raw = EXCLUDED.raw`,
      [symbol, runDate, pe, evEbitda, fcfYield, JSON.stringify({ profile: profile || {}, basic: basic || {} })]
    );
    upserted += 1;
  }

  return { generated: upserted, symbolsScanned: symbols.length, snapshotsUpserted: upserted };
};

const run = async () =>
  withTrackedJobRun({
    query,
    jobName: 'fundamentals_weekly',
    run: runCore
  });

module.exports = { run, runCore };
