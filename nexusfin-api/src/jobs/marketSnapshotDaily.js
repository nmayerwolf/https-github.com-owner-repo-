const { query } = require('../config/db');
const finnhub = require('../services/finnhub');
const { withTrackedJobRun } = require('../services/jobRunTracker');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const toNum = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const candlesToQuote = (candles = {}) => {
  const closes = Array.isArray(candles?.c) ? candles.c : [];
  if (!closes.length) return null;
  const opens = Array.isArray(candles?.o) ? candles.o : [];
  const highs = Array.isArray(candles?.h) ? candles.h : [];
  const lows = Array.isArray(candles?.l) ? candles.l : [];
  const volumes = Array.isArray(candles?.v) ? candles.v : [];
  const close = toNum(closes[closes.length - 1]);
  if (!Number.isFinite(close) || close <= 0) return null;
  const previousClose = closes.length > 1 ? toNum(closes[closes.length - 2]) : null;
  return {
    o: toNum(opens[opens.length - 1] ?? close),
    h: toNum(highs[highs.length - 1] ?? close),
    l: toNum(lows[lows.length - 1] ?? close),
    c: close,
    v: toNum(volumes[volumes.length - 1] ?? 0) || 0,
    pc: previousClose,
    dp: Number.isFinite(previousClose) && previousClose !== 0 ? ((close - previousClose) / previousClose) * 100 : null
  };
};

const fetchQuoteByCategory = async ({ symbol, category }) => {
  const categoryLower = String(category || '').toLowerCase();

  if (categoryLower === 'crypto') {
    const toTs = Math.floor(Date.now() / 1000);
    const fromTs = toTs - 3 * 24 * 60 * 60;
    const candles = await finnhub.cryptoCandles(symbol, 'D', fromTs, toTs);
    return candlesToQuote(candles);
  }

  if (categoryLower === 'fx' || (categoryLower === 'metal' && String(symbol).includes('_'))) {
    const [from, to] = String(symbol || '').split('_');
    if (!from || !to) throw new Error(`Invalid FX symbol format: ${symbol}`);
    const toTs = Math.floor(Date.now() / 1000);
    const fromTs = toTs - 3 * 24 * 60 * 60;
    const candles = await finnhub.forexCandles(from, to, 'D', fromTs, toTs);
    return candlesToQuote(candles);
  }

  return finnhub.quote(symbol);
};

const upsertBar = async ({ symbol, quote }) => {
  await query(
    `INSERT INTO market_daily_bars (
      symbol, bar_date, date, open, high, low, close, volume, previous_close, change_pct, source, fetched_at
    )
     VALUES ($1, CURRENT_DATE, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, 'finnhub', NOW())
     ON CONFLICT (symbol, bar_date) DO UPDATE SET
       date = EXCLUDED.date,
       open = EXCLUDED.open,
       high = EXCLUDED.high,
       low = EXCLUDED.low,
       close = EXCLUDED.close,
       volume = EXCLUDED.volume,
       previous_close = EXCLUDED.previous_close,
       change_pct = EXCLUDED.change_pct,
       source = EXCLUDED.source,
       fetched_at = NOW()`,
    [symbol, toNum(quote?.o), toNum(quote?.h), toNum(quote?.l), toNum(quote?.c), toNum(quote?.v) || 0, toNum(quote?.pc), toNum(quote?.dp)]
  );
};

const readActiveSymbols = async (categories = null) => {
  const params = [];
  let where = 'WHERE COALESCE(active, is_active, true) = true';
  if (Array.isArray(categories) && categories.length) {
    params.push(categories.map((item) => String(item || '').toLowerCase()));
    where += ` AND LOWER(COALESCE(category, asset_type, 'equity')) = ANY($${params.length}::text[])`;
  }

  const out = await query(
    `SELECT symbol, LOWER(COALESCE(category, asset_type, 'equity')) AS category
     FROM universe_symbols
     ${where}
     ORDER BY symbol ASC`,
    params
  );
  return out.rows || [];
};

const runCore = async ({ categories = null, waitMs = 1300 } = {}) => {
  const symbols = await readActiveSymbols(categories);
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < symbols.length; i += 1) {
    const { symbol, category } = symbols[i];
    try {
      const quote = await fetchQuoteByCategory({ symbol, category });
      if (!quote || !Number.isFinite(Number(quote.c)) || Number(quote.c) <= 0) {
        throw new Error('Quote unavailable');
      }
      await upsertBar({ symbol, quote });
      ok += 1;
    } catch (error) {
      console.error(`[job:market_snapshot] ${symbol} failed:`, error.message || error);
      fail += 1;
    }
    console.log(`[job:market_snapshot] ${i + 1}/${symbols.length} symbols fetched, ${fail} errors`);
    if (i < symbols.length - 1 && waitMs > 0) {
      await sleep(waitMs);
    }
  }

  console.log(`[job:market_snapshot] done: ${ok} ok, ${fail} fail`);
  return { ok, fail, total: symbols.length, symbols_ok: ok, symbols_fail: fail };
};

const run = async () =>
  withTrackedJobRun({
    query,
    jobName: 'market_snapshot_daily',
    run: () => runCore()
  });

const runCryptoFx = async () =>
  withTrackedJobRun({
    query,
    jobName: 'market_snapshot_crypto_fx',
    run: () => runCore({ categories: ['crypto', 'fx', 'metal'] })
  });

module.exports = { run, runCryptoFx, fetchQuoteByCategory, candlesToQuote, runCore };
