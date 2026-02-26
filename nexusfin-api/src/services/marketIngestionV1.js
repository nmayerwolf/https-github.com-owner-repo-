const { MARKET_UNIVERSE } = require('../constants/marketUniverse');
const { createPolygonAdapter } = require('../providers/PolygonAdapter');
const { createFmpAdapter } = require('../providers/FmpAdapter');
const { createNewsApiAdapter } = require('../providers/NewsApiAdapter');

const SUPPORTED_CLASSES = new Set(['equity', 'etf', 'index', 'crypto', 'fx']);
const IDEAS_CLASSES = new Set(['equity', 'etf']);
const KEYWORDS = ['rates', 'cpi', 'war', 'opec', 'earnings', 'tariffs', 'sanctions', 'fed', 'inflation'];
const NEWS_PRIMARY_QUERY = 'markets OR stocks OR fed OR inflation OR earnings';
const BUSINESS_URL_HINTS = ['marketwatch', 'bloomberg', 'reuters', 'wsj', 'ft.com', 'cnbc', 'economictimes', 'investing.com'];
const NEWS_FALLBACK_TAGS = [
  { terms: ['bitcoin', 'btc', 'ethereum', 'crypto', 'ripple', 'xrp'], symbol: 'BTCUSDT', assetClass: 'crypto' },
  { terms: ['oil', 'opec', 'energy', 'crude', 'gas'], symbol: 'XLE', assetClass: 'etf' },
  { terms: ['bank', 'banks', 'financial', 'credit', 'fed', 'rates', 'treasury'], symbol: 'XLF', assetClass: 'etf' },
  { terms: ['semiconductor', 'chip', 'ai', 'cloud', 'software', 'tech'], symbol: 'QQQ', assetClass: 'etf' },
  { terms: ['market', 'stock', 'stocks', 'investor', 'investors', 's&p', 'wall street', 'tariff', 'inflation', 'macro'], symbol: 'SPY', assetClass: 'etf' }
];
const REPUTATION = {
  reuters: 1,
  bloomberg: 0.95,
  ft: 0.9,
  wsj: 0.9,
  cnbc: 0.75
};

const toNum = (value, fallback = null) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const titleText = (item) => `${String(item?.title || '')} ${String(item?.description || '')} ${String(item?.url || '')}`.toUpperCase();

const nowIso = () => new Date().toISOString();
const untitledLike = (value) => {
  const text = String(value || '').trim().toLowerCase();
  return !text || text === 'untitled' || text === '(untitled)' || text === '[removed]' || text === '[deleted]';
};

const titleFromUrl = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  try {
    const u = new URL(value);
    const tail = decodeURIComponent((u.pathname || '').split('/').filter(Boolean).pop() || '');
    if (!tail) return '';
    return tail
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase());
  } catch {
    return '';
  }
};

const addDaysIsoDate = (date, days) => {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const asAssetClass = (category) => (SUPPORTED_CLASSES.has(String(category || '').toLowerCase()) ? String(category).toLowerCase() : null);

const toPolygonSymbol = (symbol, assetClass) => {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return raw;
  if (assetClass === 'crypto') return raw.replace(/_/g, '').replace(/USDT$/, 'USD');
  if (assetClass === 'fx') return raw.replace(/_/g, '');
  return raw;
};

const asVendorSource = (vendor, payload = {}) => ({ vendor, ...payload });

const uniqueBy = (items, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
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

const createMarketIngestionV1Service = ({ query, logger = console, adapters = {} }) => {
  const polygon = adapters.polygon || createPolygonAdapter();
  const fmp = adapters.fmp || createFmpAdapter();
  const newsApi = adapters.newsApi || createNewsApiAdapter();

  const trackedAssets = MARKET_UNIVERSE
    .map((asset) => ({ ...asset, assetClass: asAssetClass(asset.category) }))
    .filter((asset) => asset.assetClass);

  const assetsBySymbol = new Map(trackedAssets.map((a) => [String(a.symbol).toUpperCase(), a]));

  const ensureAssetsSeeded = async () => {
    for (const asset of trackedAssets) {
      await query(
        `INSERT INTO assets (asset_id, ticker, name, asset_type, exchange, currency, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4::asset_type_enum, NULL, 'USD', true, NOW(), NOW())
         ON CONFLICT (asset_id)
         DO UPDATE SET ticker = EXCLUDED.ticker,
                       name = EXCLUDED.name,
                       asset_type = EXCLUDED.asset_type,
                       is_active = true,
                       updated_at = NOW()`,
        [asset.id, asset.symbol, asset.name, asset.assetClass]
      );
    }
  };

  const startRun = async (runKind, config = {}) => {
    const out = await query(`INSERT INTO runs (run_kind, status, config) VALUES ($1, 'running', $2::jsonb) RETURNING run_id`, [runKind, JSON.stringify(config)]);
    return out.rows[0].run_id;
  };

  const finishRun = async (runId, status, errorMessage = null) => {
    await query(`UPDATE runs SET finished_at = NOW(), status = $2, error_message = $3 WHERE run_id = $1`, [runId, status, errorMessage]);
  };

  const upsertSourceMap = async (assetId, vendor, vendorSymbol) => {
    await query(
      `INSERT INTO asset_source_map (asset_id, vendor, vendor_symbol, extra)
       VALUES ($1, $2::source_vendor, $3, '{}'::jsonb)
       ON CONFLICT (asset_id, vendor, vendor_symbol) DO NOTHING`,
      [assetId, vendor, vendorSymbol]
    );
  };

  const wasRunSuccessful = async (runKind, runDate) => {
    const out = await query(
      `SELECT 1
       FROM runs
       WHERE run_kind = $1
         AND status = 'success'
         AND error_message IS NULL
         AND config->>'runDate' = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [runKind, runDate]
    );
    return (out.rows || []).length > 0;
  };

  const hasFreshNewsInWindow = async (hours = 24) => {
    const out = await query(
      `SELECT COUNT(*)::int AS total
       FROM news_items
       WHERE created_at >= NOW() - ($1::int || ' hours')::interval`,
      [hours]
    );
    return Number(out.rows?.[0]?.total || 0) > 0;
  };

  const isRateLimited = (error) => Number(error?.status) === 429 || String(error?.message || '').includes('HTTP 429');

  const ingestMarketSnapshots = async ({ date } = {}) => {
    const runDate = date || new Date().toISOString().slice(0, 10);
    const runId = await startRun('ingest_market_snapshots', { runDate });
    let inserted = 0;
    let skipped = 0;

    try {
      await ensureAssetsSeeded();

      for (const asset of trackedAssets) {
        const polygonSymbol = toPolygonSymbol(asset.symbol, asset.assetClass);
        const normalizedAsset = { symbol: polygonSymbol, assetClass: asset.assetClass };

        try {
          const snap = await polygon.getSnapshot(normalizedAsset);
          await upsertSourceMap(asset.id, 'polygon', polygonSymbol);

          await query(
            `INSERT INTO market_snapshots (run_id, asset_id, ts, last, change_abs, change_pct, day_high, day_low, volume, currency, sources)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
             ON CONFLICT (run_id, asset_id)
             DO UPDATE SET ts = EXCLUDED.ts,
                           last = EXCLUDED.last,
                           change_abs = EXCLUDED.change_abs,
                           change_pct = EXCLUDED.change_pct,
                           day_high = EXCLUDED.day_high,
                           day_low = EXCLUDED.day_low,
                           volume = EXCLUDED.volume,
                           currency = EXCLUDED.currency,
                           sources = EXCLUDED.sources`,
            [
              runId,
              asset.id,
              snap.ts,
              toNum(snap.last, 0),
              toNum(snap.changeAbs, null),
              toNum(snap.changePct, null),
              toNum(snap.dayHigh, null),
              toNum(snap.dayLow, null),
              toNum(snap.volume, null),
              snap.currency || 'USD',
              JSON.stringify(snap.sources || [asVendorSource('polygon', { vendorSymbol: polygonSymbol })])
            ]
          );
          inserted += 1;
        } catch (error) {
          skipped += 1;
          logger.warn('[ingest_market_snapshots] skip', asset.symbol, error?.message || error);
        }
      }

      await finishRun(runId, 'success');
      return { ok: true, runId, date: runDate, inserted, skipped };
    } catch (error) {
      await finishRun(runId, 'failed', String(error?.message || error));
      return { ok: false, runId, date: runDate, inserted, skipped, error: String(error?.message || error) };
    }
  };

  const ingestPriceBars = async ({ date } = {}) => {
    const runDate = date || new Date().toISOString().slice(0, 10);
    const from = addDaysIsoDate(runDate, -2);
    const to = runDate;
    const runId = await startRun('ingest_price_bars', { from, to });
    let inserted = 0;
    let skipped = 0;

    try {
      for (const asset of trackedAssets) {
        const polygonSymbol = toPolygonSymbol(asset.symbol, asset.assetClass);
        const normalizedAsset = { symbol: polygonSymbol, assetClass: asset.assetClass };

        try {
          const bars = await polygon.getBars(normalizedAsset, { from, to, interval: '1d' });
          await upsertSourceMap(asset.id, 'polygon', polygonSymbol);

          for (const bar of bars) {
            await query(
              `INSERT INTO price_bars (asset_id, interval, ts, open, high, low, close, volume, currency, sources)
               VALUES ($1, '1d', $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
               ON CONFLICT (asset_id, interval, ts)
               DO UPDATE SET open = EXCLUDED.open,
                             high = EXCLUDED.high,
                             low = EXCLUDED.low,
                             close = EXCLUDED.close,
                             volume = EXCLUDED.volume,
                             currency = EXCLUDED.currency,
                             sources = EXCLUDED.sources`,
              [
                asset.id,
                bar.ts,
                toNum(bar.open, 0),
                toNum(bar.high, 0),
                toNum(bar.low, 0),
                toNum(bar.close, 0),
                toNum(bar.volume, null),
                bar.currency || 'USD',
                JSON.stringify(bar.sources || [asVendorSource('polygon', { vendorSymbol: polygonSymbol })])
              ]
            );

            await query(
              `INSERT INTO daily_prices (asset_id, date, open, high, low, close, adj_close, volume, source, ingested_at)
               VALUES ($1, ($2::timestamptz AT TIME ZONE 'UTC')::date, $3, $4, $5, $6, $6, $7, 'polygon', NOW())
               ON CONFLICT (asset_id, date)
               DO UPDATE SET open = EXCLUDED.open,
                             high = EXCLUDED.high,
                             low = EXCLUDED.low,
                             close = EXCLUDED.close,
                             adj_close = EXCLUDED.adj_close,
                             volume = EXCLUDED.volume,
                             source = EXCLUDED.source,
                             ingested_at = NOW()`,
              [asset.id, bar.ts, toNum(bar.open, 0), toNum(bar.high, 0), toNum(bar.low, 0), toNum(bar.close, 0), toNum(bar.volume, null)]
            );

            inserted += 1;
          }
        } catch (error) {
          skipped += 1;
          logger.warn('[ingest_price_bars] skip', asset.symbol, error?.message || error);
        }
      }

      await finishRun(runId, 'success');
      return { ok: true, runId, from, to, inserted, skipped };
    } catch (error) {
      await finishRun(runId, 'failed', String(error?.message || error));
      return { ok: false, runId, from, to, inserted, skipped, error: String(error?.message || error) };
    }
  };

  const ingestFundamentals = async ({ date } = {}) => {
    const runDate = date || new Date().toISOString().slice(0, 10);
    const runId = await startRun('ingest_fundamentals', { runDate });
    let inserted = 0;
    let skipped = 0;

    try {
      if (await wasRunSuccessful('ingest_fundamentals', runDate)) {
        await finishRun(runId, 'success');
        return { ok: true, runId, date: runDate, inserted: 0, skipped: 0, alreadyIngested: true };
      }

      for (const asset of trackedAssets.filter((item) => IDEAS_CLASSES.has(item.assetClass))) {
        try {
          const fundamentals = await fmp.getFundamentals({ symbol: asset.symbol, assetClass: asset.assetClass });
          await upsertSourceMap(asset.id, 'fmp', asset.symbol);

          await query(
            `INSERT INTO fundamentals (
                asset_id, as_of, currency, market_cap, revenue_ttm, gross_margin_ttm,
                operating_margin_ttm, net_margin_ttm, fcf_ttm, net_debt, debt_to_ebitda,
                pe_ttm, ev_to_ebitda_ttm, price_to_sales_ttm, raw, sources
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb)
             ON CONFLICT (asset_id, as_of)
             DO UPDATE SET currency = EXCLUDED.currency,
                           market_cap = EXCLUDED.market_cap,
                           revenue_ttm = EXCLUDED.revenue_ttm,
                           gross_margin_ttm = EXCLUDED.gross_margin_ttm,
                           operating_margin_ttm = EXCLUDED.operating_margin_ttm,
                           net_margin_ttm = EXCLUDED.net_margin_ttm,
                           fcf_ttm = EXCLUDED.fcf_ttm,
                           net_debt = EXCLUDED.net_debt,
                           debt_to_ebitda = EXCLUDED.debt_to_ebitda,
                           pe_ttm = EXCLUDED.pe_ttm,
                           ev_to_ebitda_ttm = EXCLUDED.ev_to_ebitda_ttm,
                           price_to_sales_ttm = EXCLUDED.price_to_sales_ttm,
                           raw = EXCLUDED.raw,
                           sources = EXCLUDED.sources`,
            [
              asset.id,
              fundamentals.asOf,
              fundamentals.currency || 'USD',
              toNum(fundamentals.marketCap, null),
              toNum(fundamentals.revenueTTM, null),
              toNum(fundamentals.grossMarginTTM, null),
              toNum(fundamentals.operatingMarginTTM, null),
              toNum(fundamentals.netMarginTTM, null),
              toNum(fundamentals.fcfTTM, null),
              toNum(fundamentals.netDebt, null),
              toNum(fundamentals.debtToEbitda, null),
              toNum(fundamentals.peTTM, null),
              toNum(fundamentals.evToEbitdaTTM, null),
              toNum(fundamentals.priceToSalesTTM, null),
              JSON.stringify(fundamentals.raw || {}),
              JSON.stringify(fundamentals.sources || [asVendorSource('fmp', { vendorSymbol: asset.symbol })])
            ]
          );

          await query(
            `INSERT INTO fundamentals_periodic (
               asset_id, period_type, period_end_date, revenue, gross_margin,
               operating_margin, pe_ttm, ev_ebitda_ttm, market_cap, source, ingested_at
             )
             VALUES ($1, 'ttm', $2::date, $3, $4, $5, $6, $7, $8, 'fmp', NOW())
             ON CONFLICT (asset_id, period_type, period_end_date)
             DO UPDATE SET revenue = EXCLUDED.revenue,
                           gross_margin = EXCLUDED.gross_margin,
                           operating_margin = EXCLUDED.operating_margin,
                           pe_ttm = EXCLUDED.pe_ttm,
                           ev_ebitda_ttm = EXCLUDED.ev_ebitda_ttm,
                           market_cap = EXCLUDED.market_cap,
                           source = EXCLUDED.source,
                           ingested_at = NOW()`,
            [
              asset.id,
              runDate,
              toNum(fundamentals.revenueTTM, null),
              toNum(fundamentals.grossMarginTTM, null),
              toNum(fundamentals.operatingMarginTTM, null),
              toNum(fundamentals.peTTM, null),
              toNum(fundamentals.evToEbitdaTTM, null),
              toNum(fundamentals.marketCap, null)
            ]
          );

          inserted += 1;
        } catch (error) {
          skipped += 1;
          logger.warn('[ingest_fundamentals] skip', asset.symbol, error?.message || error);
        }
      }

      await finishRun(runId, 'success');
      return { ok: true, runId, date: runDate, inserted, skipped };
    } catch (error) {
      await finishRun(runId, 'failed', String(error?.message || error));
      return { ok: false, runId, date: runDate, inserted, skipped, error: String(error?.message || error) };
    }
  };

  const ingestEarningsCalendar = async ({ date } = {}) => {
    const runDate = date || new Date().toISOString().slice(0, 10);
    const toDate = addDaysIsoDate(runDate, 30);
    const runId = await startRun('ingest_earnings_calendar', { from: runDate, to: toDate });
    let inserted = 0;

    try {
      if (await wasRunSuccessful('ingest_earnings_calendar', runDate)) {
        await finishRun(runId, 'success');
        return { ok: true, runId, from: runDate, to: toDate, inserted: 0, alreadyIngested: true };
      }

      const events = await fmp.getEarningsCalendar({ from: runDate, to: toDate });
      const symbolToAsset = new Map(trackedAssets.map((asset) => [String(asset.symbol).toUpperCase(), asset]));

      for (const item of events) {
        const symbol = String(item?.asset?.symbol || '').toUpperCase();
        const asset = symbolToAsset.get(symbol);
        if (!asset) continue;

        await upsertSourceMap(asset.id, 'fmp', symbol);

        await query(
          `INSERT INTO earnings_events (asset_id, fiscal_period, report_date, time_of_day, eps_estimate, revenue_estimate, sources)
           VALUES ($1, $2, $3, $4::earnings_tod, $5, $6, $7::jsonb)
           ON CONFLICT (asset_id, report_date)
           DO UPDATE SET fiscal_period = EXCLUDED.fiscal_period,
                         time_of_day = EXCLUDED.time_of_day,
                         eps_estimate = EXCLUDED.eps_estimate,
                         revenue_estimate = EXCLUDED.revenue_estimate,
                         sources = EXCLUDED.sources`,
          [
            asset.id,
            item.fiscalPeriod || null,
            item.reportDate,
            item.timeOfDay || 'UNKNOWN',
            toNum(item.epsEstimate, null),
            toNum(item.revenueEstimate, null),
            JSON.stringify(item.sources || [asVendorSource('fmp', { vendorSymbol: symbol })])
          ]
        );

        inserted += 1;
      }

      await finishRun(runId, 'success');
      return { ok: true, runId, from: runDate, to: toDate, inserted };
    } catch (error) {
      if (isRateLimited(error)) {
        await finishRun(runId, 'success', String(error?.message || error));
        return { ok: true, runId, from: runDate, to: toDate, inserted, rateLimited: true, error: String(error?.message || error) };
      }
      await finishRun(runId, 'failed', String(error?.message || error));
      return { ok: false, runId, from: runDate, to: toDate, inserted, error: String(error?.message || error) };
    }
  };

  const detectRelatedAssets = (item) => {
    const text = titleText(item);
    const related = [];
    for (const asset of trackedAssets) {
      const symbol = String(asset.symbol || '').toUpperCase();
      if (!symbol) continue;
      const symbolVariants = new Set([
        symbol,
        symbol.replace(/_/g, ''),
        symbol.replace('.', ''),
        symbol.replace(/USDT$/, '')
      ]);
      const name = String(asset.name || '').toUpperCase().trim();
      const nameTokens = name.split(/\s+/).filter((t) => t.length >= 4);
      const symbolHit = Array.from(symbolVariants).some((s) => s && (text.includes(`${s} `) || text.includes(` ${s}`) || text.includes(s)));
      const nameHit = name && (text.includes(name) || nameTokens.some((token) => text.includes(token)));
      if (symbolHit || nameHit) {
        related.push({ symbol, assetClass: asset.assetClass });
      }
      if (related.length >= 4) break;
    }
    const unique = uniqueBy(related, (a) => `${a.symbol}:${a.assetClass}`);
    if (unique.length) return unique;

    const lowered = text.toLowerCase();
    const fallback = [];
    for (const rule of NEWS_FALLBACK_TAGS) {
      if (rule.terms.some((term) => lowered.includes(term))) {
        fallback.push({ symbol: rule.symbol, assetClass: rule.assetClass });
      }
      if (fallback.length >= 2) break;
    }
    const dedupedFallback = uniqueBy(fallback, (a) => `${a.symbol}:${a.assetClass}`);
    if (dedupedFallback.length) return dedupedFallback;

    const url = String(item?.url || '').toLowerCase();
    const looksFinancial =
      KEYWORDS.some((k) => lowered.includes(k)) ||
      BUSINESS_URL_HINTS.some((hint) => url.includes(hint)) ||
      lowered.includes('market') ||
      lowered.includes('stock');
    if (looksFinancial) {
      return [{ symbol: 'SPY', assetClass: 'etf' }];
    }

    return [];
  };

  const saveNewsItems = async (items) => {
    let inserted = 0;
    for (const item of items) {
      const url = String(item.url || '').trim();
      const rawHeadline = String(item.title || '').trim();
      const headline = untitledLike(rawHeadline) ? titleFromUrl(url) || 'Untitled' : rawHeadline;
      const description = item.description || null;
      const publishedAt = item.ts || nowIso();
      const sourceName = item.sourceName || null;
      const sourceKey = String(sourceName || 'newsapi').toLowerCase();
      const relatedAssets = detectRelatedAssets({ ...item, title: headline, description, url });
      await query(
        `INSERT INTO news_items (
           id, ts, source, headline, summary, tags, tickers, url, raw,
           published_at, title, description, source_name, image_url,
           language, relevance_score, related_assets, sources
         )
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, '[]'::jsonb, '{}'::jsonb, $5, $6::jsonb,
                 $7, $8, $9, $10, $11, $12, NULL, $13::jsonb, $14::jsonb)
         ON CONFLICT (url_hash)
         DO UPDATE SET published_at = EXCLUDED.published_at,
                       ts = EXCLUDED.ts,
                       source = EXCLUDED.source,
                       headline = EXCLUDED.headline,
                       summary = EXCLUDED.summary,
                       title = EXCLUDED.title,
                       description = EXCLUDED.description,
                       source_name = EXCLUDED.source_name,
                       image_url = EXCLUDED.image_url,
                       language = EXCLUDED.language,
                       raw = EXCLUDED.raw,
                       related_assets = EXCLUDED.related_assets,
                       sources = EXCLUDED.sources`,
        [
          publishedAt,
          sourceKey,
          headline,
          description,
          url,
          JSON.stringify({ item }),
          publishedAt,
          headline,
          description,
          sourceName,
          item.imageUrl || null,
          item.language || 'en',
          JSON.stringify(relatedAssets),
          JSON.stringify(item.sources || [asVendorSource('newsapi', { url })])
        ]
      );
      inserted += 1;
    }
    return inserted;
  };

  const rehydrateNewsRelations24h = async () => {
    const out = await query(
      `SELECT news_id, title, description, url, related_assets
       FROM news_items
       WHERE published_at >= NOW() - INTERVAL '24 hours'
       ORDER BY published_at DESC
       LIMIT 1200`
    );
    let updated = 0;
    for (const row of out.rows || []) {
      const current = Array.isArray(row.related_assets) ? row.related_assets : parseJson(row.related_assets, []);
      if (current.length > 0) continue;
      const related = detectRelatedAssets({
        title: row.title,
        description: row.description,
        url: row.url
      });
      if (!related.length) continue;
      await query(`UPDATE news_items SET related_assets = $2::jsonb WHERE news_id = $1`, [row.news_id, JSON.stringify(related)]);
      updated += 1;
    }
    return updated;
  };

  const ingestNews = async ({ date } = {}) => {
    const runDate = date || new Date().toISOString().slice(0, 10);
    const runId = await startRun('ingest_news', { runDate });

    try {
      if ((await wasRunSuccessful('ingest_news', runDate)) && (await hasFreshNewsInWindow(24))) {
        await finishRun(runId, 'success');
        return { ok: true, runId, date: runDate, inserted: 0, relinked: 0, alreadyIngested: true };
      }

      const from = `${addDaysIsoDate(runDate, -1)}T00:00:00.000Z`;
      const top = await newsApi.getTopHeadlines({ language: 'en', pageSize: 50 });
      // Free tier friendly: one broad thematic query instead of many keyword fan-out calls.
      const thematic = await newsApi.getEverything({ q: NEWS_PRIMARY_QUERY, from, language: 'en', pageSize: 50 });
      const merged = uniqueBy([...top, ...thematic], (item) => String(item.url || ''));
      const inserted = await saveNewsItems(merged);
      const relinked = await rehydrateNewsRelations24h();

      await finishRun(runId, 'success');
      return { ok: true, runId, date: runDate, inserted, relinked };
    } catch (error) {
      if (isRateLimited(error)) {
        await finishRun(runId, 'success', String(error?.message || error));
        return { ok: true, runId, date: runDate, inserted: 0, relinked: 0, rateLimited: true, error: String(error?.message || error) };
      }
      await finishRun(runId, 'failed', String(error?.message || error));
      return { ok: false, runId, date: runDate, inserted: 0, error: String(error?.message || error) };
    }
  };

  const ingestNewsBackfill = async ({ date } = {}) => {
    const runDate = date || new Date().toISOString().slice(0, 10);
    const runId = await startRun('ingest_news_backfill', { runDate, vendor: 'newsapi' });

    try {
      if ((await wasRunSuccessful('ingest_news_backfill', runDate)) && (await hasFreshNewsInWindow(24))) {
        await finishRun(runId, 'success');
        return { ok: true, runId, date: runDate, inserted: 0, relinked: 0, alreadyIngested: true };
      }

      const fromDate = addDaysIsoDate(runDate, -3);
      const from = `${fromDate}T00:00:00.000Z`;
      const to = `${runDate}T23:59:59.000Z`;
      // Keep backfill lightweight on free tier.
      const thematic = await newsApi.getEverything({ q: NEWS_PRIMARY_QUERY, from, to, language: 'en', pageSize: 50 });
      const merged = uniqueBy(thematic, (item) => String(item.url || ''));
      const inserted = await saveNewsItems(merged);
      const relinked = await rehydrateNewsRelations24h();

      await finishRun(runId, 'success');
      return { ok: true, runId, date: runDate, inserted, relinked };
    } catch (error) {
      if (isRateLimited(error)) {
        await finishRun(runId, 'success', String(error?.message || error));
        return { ok: true, runId, date: runDate, inserted: 0, relinked: 0, rateLimited: true, error: String(error?.message || error) };
      }
      await finishRun(runId, 'failed', String(error?.message || error));
      return { ok: false, runId, date: runDate, inserted: 0, error: String(error?.message || error) };
    }
  };

  const computeRelevanceScores = async ({ date } = {}) => {
    const runDate = date || new Date().toISOString().slice(0, 10);
    const runId = await startRun('compute_relevance_scores', { runDate });

    try {
      const marketOut = await query(
        `SELECT DISTINCT ON (asset_id)
            asset_id,
            change_pct
         FROM market_snapshots
         ORDER BY asset_id, ts DESC`
      );
      const marketByAssetId = new Map((marketOut.rows || []).map((row) => [String(row.asset_id), toNum(row.change_pct, 0) || 0]));

      const newsOut = await query(
        `SELECT news_id, published_at, title, description, source_name, related_assets
         FROM news_items
         WHERE published_at >= NOW() - INTERVAL '48 hours'
         ORDER BY published_at DESC
         LIMIT 400`
      );

      let updated = 0;

      for (const row of newsOut.rows || []) {
        const ageHours = Math.max(0, (Date.now() - new Date(row.published_at).getTime()) / (1000 * 60 * 60));
        const recency = Math.max(0, Math.min(1, 1 - ageHours / 48));

        const sourceName = String(row.source_name || '').toLowerCase();
        const reputation = Object.entries(REPUTATION).reduce((best, [key, score]) => (sourceName.includes(key) ? Math.max(best, score) : best), 0.55);

        const text = `${String(row.title || '')} ${String(row.description || '')}`.toLowerCase();
        const keywordHits = KEYWORDS.filter((k) => text.includes(k)).length;
        const keywordWeight = Math.min(1, keywordHits / 4);

        const related = Array.isArray(row.related_assets) ? row.related_assets : parseJson(row.related_assets, []);
        const maxMove = (related || []).reduce((best, item) => {
          const symbol = String(item?.symbol || '').toUpperCase();
          const asset = assetsBySymbol.get(symbol);
          if (!asset) return best;
          return Math.max(best, Math.abs(toNum(marketByAssetId.get(asset.id), 0) || 0));
        }, 0);
        const marketMove = Math.min(1, maxMove / 4);

        const score = 0.4 * recency + 0.2 * reputation + 0.2 * marketMove + 0.2 * keywordWeight;
        await query(`UPDATE news_items SET relevance_score = $2 WHERE news_id = $1`, [row.news_id, Number(score.toFixed(6))]);
        updated += 1;
      }

      await finishRun(runId, 'success');
      return { ok: true, runId, date: runDate, updated };
    } catch (error) {
      await finishRun(runId, 'failed', String(error?.message || error));
      return { ok: false, runId, date: runDate, updated: 0, error: String(error?.message || error) };
    }
  };

  const runIngestion = async ({ date } = {}) => {
    const runDate = date || new Date().toISOString().slice(0, 10);
    const results = {
      snapshots: await ingestMarketSnapshots({ date: runDate }),
      bars: await ingestPriceBars({ date: runDate }),
      fundamentals: await ingestFundamentals({ date: runDate }),
      earnings: await ingestEarningsCalendar({ date: runDate }),
      news: await ingestNews({ date: runDate }),
      backfill: await ingestNewsBackfill({ date: runDate }),
      relevance: await computeRelevanceScores({ date: runDate })
    };

    return {
      ok: Object.values(results).every((item) => item?.ok !== false),
      date: runDate,
      ingested: true,
      results
    };
  };

  return {
    runIngestion,
    ingestMarketSnapshots,
    ingestPriceBars,
    ingestFundamentals,
    ingestEarningsCalendar,
    ingestNews,
    ingestNewsBackfill,
    computeRelevanceScores
  };
};

module.exports = { createMarketIngestionV1Service };
