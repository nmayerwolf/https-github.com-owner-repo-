const crypto = require('crypto');
const { FinnhubProvider } = require('../providers/FinnhubProvider');

const DAY_SEC = 24 * 60 * 60;

const toNum = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const asDate = (date = new Date()) => new Date(date).toISOString().slice(0, 10);

const dateToUnix = (dateText) => Math.floor(new Date(`${dateText}T00:00:00Z`).getTime() / 1000);

const average = (values) => {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
};

const stdDevSample = (values) => {
  if (values.length < 2) return null;
  const mean = average(values);
  if (!Number.isFinite(mean)) return null;
  const variance = values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
};

const percentileRank = (sortedValues, value) => {
  if (!sortedValues.length || !Number.isFinite(value)) return null;
  let lower = 0;
  for (const item of sortedValues) {
    if (item <= value) lower += 1;
  }
  return Number((lower / sortedValues.length).toFixed(3));
};

const computeSeriesMetrics = (bars = []) => {
  const rows = [...bars]
    .filter((row) => row && row.date && Number.isFinite(Number(row.close)))
    .map((row) => ({ ...row, close: Number(row.close) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const out = [];

  for (let i = 0; i < rows.length; i += 1) {
    const current = rows[i];
    const close = current.close;

    const prev1 = rows[i - 1]?.close;
    const prev5 = rows[i - 5]?.close;
    const prev21 = rows[i - 21]?.close;
    const prev63 = rows[i - 63]?.close;

    const ret1d = Number.isFinite(prev1) && prev1 !== 0 ? close / prev1 - 1 : null;
    const ret1w = Number.isFinite(prev5) && prev5 !== 0 ? close / prev5 - 1 : null;
    const ret1m = Number.isFinite(prev21) && prev21 !== 0 ? close / prev21 - 1 : null;
    const ret3m = Number.isFinite(prev63) && prev63 !== 0 ? close / prev63 - 1 : null;

    const closes20 = rows.slice(Math.max(0, i - 19), i + 1).map((row) => row.close);
    const closes50 = rows.slice(Math.max(0, i - 49), i + 1).map((row) => row.close);
    const ma20 = closes20.length === 20 ? average(closes20) : null;
    const ma50 = closes50.length === 50 ? average(closes50) : null;

    const returns20 = [];
    for (let p = Math.max(1, i - 19); p <= i; p += 1) {
      const a = rows[p - 1]?.close;
      const b = rows[p]?.close;
      if (Number.isFinite(a) && Number.isFinite(b) && a !== 0) returns20.push(b / a - 1);
    }
    const returns60 = [];
    for (let p = Math.max(1, i - 59); p <= i; p += 1) {
      const a = rows[p - 1]?.close;
      const b = rows[p]?.close;
      if (Number.isFinite(a) && Number.isFinite(b) && a !== 0) returns60.push(b / a - 1);
    }

    const vol20dRaw = returns20.length >= 10 ? stdDevSample(returns20) : null;
    const vol60dRaw = returns60.length >= 20 ? stdDevSample(returns60) : null;
    const vol20d = Number.isFinite(vol20dRaw) ? vol20dRaw * Math.sqrt(252) : null;
    const vol60d = Number.isFinite(vol60dRaw) ? vol60dRaw * Math.sqrt(252) : null;

    out.push({
      symbol: current.symbol,
      date: current.date,
      ret_1d: ret1d,
      ret_1w: ret1w,
      ret_1m: ret1m,
      ret_3m: ret3m,
      vol_20d: vol20d,
      vol_60d: vol60d,
      ma20,
      ma50
    });
  }

  return out;
};

const buildSectorPercentiles = (rows = []) => {
  const bySector = new Map();
  for (const row of rows) {
    const sector = String(row.sector || 'unknown').toLowerCase();
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector).push(row);
  }

  const out = [];

  for (const [sector, sectorRows] of bySector.entries()) {
    const pe = sectorRows.map((row) => toNum(row.pe)).filter(Number.isFinite).sort((a, b) => a - b);
    const ev = sectorRows.map((row) => toNum(row.ev_ebitda)).filter(Number.isFinite).sort((a, b) => a - b);
    const fcf = sectorRows.map((row) => toNum(row.fcf_yield)).filter(Number.isFinite).sort((a, b) => a - b);

    for (const row of sectorRows) {
      out.push({
        symbol: row.symbol,
        sector,
        pe_percentile: percentileRank(pe, toNum(row.pe)),
        ev_ebitda_percentile: percentileRank(ev, toNum(row.ev_ebitda)),
        fcf_yield_percentile: percentileRank(fcf, toNum(row.fcf_yield))
      });
    }
  }

  return out;
};

const buildNewsId = (item = {}) => {
  const explicit = String(item.id || '').trim();
  if (explicit) return explicit.slice(0, 140);

  const base = JSON.stringify({
    ts: String(item.ts || ''),
    headline: String(item.headline || '').slice(0, 240),
    url: String(item.url || '').slice(0, 240)
  });
  return `auto-${crypto.createHash('sha256').update(base).digest('hex').slice(0, 24)}`;
};

const normalizeNewsRows = (rows = []) =>
  rows
    .map((item) => {
      const tsRaw = String(item.ts || '').trim();
      const ts = tsRaw ? new Date(tsRaw).toISOString() : new Date().toISOString();
      const headline = String(item.headline || '').trim();
      if (!headline) return null;
      return {
        id: buildNewsId(item),
        ts,
        source: String(item.source || '').trim() || null,
        headline: headline.slice(0, 500),
        summary: String(item.summary || '').trim().slice(0, 4000) || null,
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 30) : [],
        tickers: Array.isArray(item.tickers)
          ? item.tickers.map((x) => String(x || '').toUpperCase()).filter(Boolean).slice(0, 20)
          : [],
        url: String(item.url || '').trim().slice(0, 1000) || null,
        raw: item.raw && typeof item.raw === 'object' ? item.raw : {}
      };
    })
    .filter(Boolean);

const createMarketIngestionService = ({ query, provider = new FinnhubProvider(), logger = console } = {}) => {
  const activeUniverseSymbols = async () => {
    const out = await query('SELECT symbol FROM universe_symbols WHERE is_active = TRUE ORDER BY symbol ASC');
    return out.rows.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean);
  };

  const runMarketSnapshotDaily = async ({ date = null, lookbackDays = 370 } = {}) => {
    const runDate = asDate(date || new Date());
    const toTs = dateToUnix(runDate) + DAY_SEC - 1;
    const fromTs = toTs - Math.max(90, Number(lookbackDays || 370)) * DAY_SEC;

    const symbols = await activeUniverseSymbols();
    if (!symbols.length) {
      return { generated: 0, date: runDate, symbolsScanned: 0, barsUpserted: 0, metricsUpserted: 0, skipped: 'NO_UNIVERSE' };
    }

    const bars = await provider.getDailyBars(symbols, fromTs, toTs);
    const barsBySymbol = new Map();

    for (const bar of bars) {
      const symbol = String(bar.symbol || '').toUpperCase();
      if (!barsBySymbol.has(symbol)) barsBySymbol.set(symbol, []);
      barsBySymbol.get(symbol).push(bar);
    }

    let barsUpserted = 0;
    let metricsUpserted = 0;

    for (const symbol of symbols) {
      const symbolBars = barsBySymbol.get(symbol) || [];
      for (const bar of symbolBars) {
        await query(
          `INSERT INTO market_daily_bars (symbol, date, open, high, low, close, volume)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (symbol, date)
           DO UPDATE SET
             open = EXCLUDED.open,
             high = EXCLUDED.high,
             low = EXCLUDED.low,
             close = EXCLUDED.close,
             volume = EXCLUDED.volume`,
          [
            symbol,
            bar.date,
            Number(bar.open),
            Number(bar.high),
            Number(bar.low),
            Number(bar.close),
            bar.volume == null ? null : Number(bar.volume)
          ]
        );
        barsUpserted += 1;
      }

      const metrics = computeSeriesMetrics(symbolBars);
      for (const metric of metrics) {
        await query(
          `INSERT INTO market_metrics_daily (symbol, date, ret_1d, ret_1w, ret_1m, ret_3m, vol_20d, vol_60d, ma20, ma50)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (symbol, date)
           DO UPDATE SET
             ret_1d = EXCLUDED.ret_1d,
             ret_1w = EXCLUDED.ret_1w,
             ret_1m = EXCLUDED.ret_1m,
             ret_3m = EXCLUDED.ret_3m,
             vol_20d = EXCLUDED.vol_20d,
             vol_60d = EXCLUDED.vol_60d,
             ma20 = EXCLUDED.ma20,
             ma50 = EXCLUDED.ma50`,
          [
            symbol,
            metric.date,
            metric.ret_1d,
            metric.ret_1w,
            metric.ret_1m,
            metric.ret_3m,
            metric.vol_20d,
            metric.vol_60d,
            metric.ma20,
            metric.ma50
          ]
        );
        metricsUpserted += 1;
      }
    }

    logger.log('[marketIngestion] snapshot daily done', { runDate, symbols: symbols.length, barsUpserted, metricsUpserted });

    return {
      generated: metricsUpserted,
      date: runDate,
      symbolsScanned: symbols.length,
      barsUpserted,
      metricsUpserted
    };
  };

  const runFundamentalsWeekly = async ({ date = null } = {}) => {
    const runDate = asDate(date || new Date());

    const recent = await query(
      `SELECT MAX(asof_date)::text AS max_date
       FROM fundamentals_snapshot`
    );
    const maxDate = String(recent.rows?.[0]?.max_date || '');
    if (maxDate) {
      const days = Math.floor((new Date(`${runDate}T00:00:00Z`) - new Date(`${maxDate}T00:00:00Z`)) / (1000 * 60 * 60 * 24));
      if (Number.isFinite(days) && days < 6) {
        return { generated: 0, date: runDate, symbolsScanned: 0, snapshotsUpserted: 0, derivedUpserted: 0, skipped: 'RECENT_SNAPSHOT' };
      }
    }

    const symbols = await activeUniverseSymbols();
    if (!symbols.length) {
      return { generated: 0, date: runDate, symbolsScanned: 0, snapshotsUpserted: 0, derivedUpserted: 0, skipped: 'NO_UNIVERSE' };
    }

    const fundamentals = await provider.getFundamentals(symbols);

    let snapshotsUpserted = 0;
    for (const row of fundamentals) {
      const symbol = String(row.symbol || '').toUpperCase();
      if (!symbol) continue;
      await query(
        `INSERT INTO fundamentals_snapshot (symbol, asof_date, pe, ev_ebitda, fcf_yield, raw)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (symbol, asof_date)
         DO UPDATE SET
           pe = EXCLUDED.pe,
           ev_ebitda = EXCLUDED.ev_ebitda,
           fcf_yield = EXCLUDED.fcf_yield,
           raw = EXCLUDED.raw`,
        [
          symbol,
          runDate,
          toNum(row.pe),
          toNum(row.evEbitda),
          toNum(row.fcfYield),
          JSON.stringify(row.raw || {})
        ]
      );
      snapshotsUpserted += 1;
    }

    const latest = await query(
      `SELECT fs.symbol, fs.pe, fs.ev_ebitda, fs.fcf_yield, COALESCE(us.sector, 'unknown') AS sector
       FROM fundamentals_snapshot fs
       JOIN universe_symbols us ON us.symbol = fs.symbol
       WHERE fs.asof_date = $1`,
      [runDate]
    );

    const derivedRows = buildSectorPercentiles(latest.rows || []);

    let derivedUpserted = 0;
    for (const row of derivedRows) {
      await query(
        `INSERT INTO fundamentals_derived (symbol, asof_date, sector, pe_percentile, ev_ebitda_percentile, fcf_yield_percentile)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (symbol, asof_date)
         DO UPDATE SET
           sector = EXCLUDED.sector,
           pe_percentile = EXCLUDED.pe_percentile,
           ev_ebitda_percentile = EXCLUDED.ev_ebitda_percentile,
           fcf_yield_percentile = EXCLUDED.fcf_yield_percentile`,
        [
          row.symbol,
          runDate,
          row.sector,
          row.pe_percentile,
          row.ev_ebitda_percentile,
          row.fcf_yield_percentile
        ]
      );
      derivedUpserted += 1;
    }

    logger.log('[marketIngestion] fundamentals weekly done', { runDate, symbols: symbols.length, snapshotsUpserted, derivedUpserted });

    return {
      generated: snapshotsUpserted + derivedUpserted,
      date: runDate,
      symbolsScanned: symbols.length,
      snapshotsUpserted,
      derivedUpserted
    };
  };

  const runNewsIngestDaily = async ({ date = null } = {}) => {
    const runDate = asDate(date || new Date());
    const fromDate = asDate(new Date(new Date(`${runDate}T00:00:00Z`).getTime() - DAY_SEC * 1000));

    const sourceRows = await provider.getNews(fromDate, runDate, []);
    const rows = normalizeNewsRows(sourceRows);

    let upserted = 0;
    for (const row of rows) {
      await query(
        `INSERT INTO news_items (id, ts, source, headline, summary, tags, tickers, url, raw)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9::jsonb)
         ON CONFLICT (id)
         DO UPDATE SET
           ts = EXCLUDED.ts,
           source = EXCLUDED.source,
           headline = EXCLUDED.headline,
           summary = EXCLUDED.summary,
           tags = EXCLUDED.tags,
           tickers = EXCLUDED.tickers,
           url = EXCLUDED.url,
           raw = EXCLUDED.raw`,
        [
          row.id,
          row.ts,
          row.source,
          row.headline,
          row.summary,
          JSON.stringify(row.tags || []),
          JSON.stringify(row.tickers || []),
          row.url,
          JSON.stringify(row.raw || {})
        ]
      );
      upserted += 1;
    }

    logger.log('[marketIngestion] news ingest daily done', { runDate, fromDate, upserted });
    return {
      generated: upserted,
      date: runDate,
      fromDate,
      upserted
    };
  };

  return {
    runMarketSnapshotDaily,
    runFundamentalsWeekly,
    runNewsIngestDaily
  };
};

module.exports = {
  createMarketIngestionService,
  computeSeriesMetrics,
  buildSectorPercentiles,
  buildNewsId,
  normalizeNewsRows
};
