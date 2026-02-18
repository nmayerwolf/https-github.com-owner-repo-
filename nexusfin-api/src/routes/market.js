const express = require('express');
const { cache } = require('../config/cache');
const { query } = require('../config/db');
const av = require('../services/alphavantage');
const finnhub = require('../services/finnhub');
const { rankNews } = require('../services/newsRanker');
const { badRequest } = require('../utils/errors');
const { MARKET_UNIVERSE } = require('../constants/marketUniverse');

const router = express.Router();
let newsTelemetryReady = false;

const getOrSet = async (key, ttlSec, fn) => {
  const cached = cache.get(key);
  if (cached) return cached;
  const value = await fn();
  cache.set(key, value, ttlSec);
  return value;
};

const ensureNewsTelemetryTable = async () => {
  if (newsTelemetryReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS news_telemetry_events (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('impression','click')),
      item_key TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'global',
      score NUMERIC,
      headline TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );
  await query('CREATE INDEX IF NOT EXISTS idx_news_telemetry_user_created ON news_telemetry_events(user_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_news_telemetry_user_theme ON news_telemetry_events(user_id, theme)');
  newsTelemetryReady = true;
};

const getThemeCtrBoost = async (userId, days = 14) => {
  try {
    await ensureNewsTelemetryTable();
    const out = await query(
      `SELECT
         theme,
         COUNT(*) FILTER (WHERE event_type = 'impression')::int AS impressions,
         COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks
       FROM news_telemetry_events
       WHERE user_id = $1
         AND created_at >= NOW() - ($2::text || ' days')::interval
       GROUP BY theme`,
      [userId, String(days)]
    );
    const boosts = {};
    for (const row of out.rows || []) {
      const impressions = Number(row.impressions || 0);
      const clicks = Number(row.clicks || 0);
      if (impressions < 5) continue;
      boosts[String(row.theme || 'global')] = impressions > 0 ? (clicks / impressions) * 100 : 0;
    }
    return boosts;
  } catch {
    return {};
  }
};

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const normalizeSymbolList = (value) => {
  const raw = String(value || '')
    .split(',')
    .map((s) => String(s || '').trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(raw)).slice(0, 60);
};

const normalizeSearchText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const scoreSearchResult = (query, item) => {
  const needle = normalizeSearchText(query);
  const symbol = normalizeSearchText(item?.symbol);
  const displaySymbol = normalizeSearchText(item?.displaySymbol);
  const description = normalizeSearchText(item?.description || item?.name);
  const type = normalizeSearchText(item?.type);

  let score = 0;
  if (symbol === needle || displaySymbol === needle) score += 120;
  else if (symbol.startsWith(needle) || displaySymbol.startsWith(needle)) score += 80;
  else if (symbol.includes(needle) || displaySymbol.includes(needle)) score += 55;

  if (description === needle) score += 95;
  else if (description.startsWith(needle)) score += 70;
  else if (description.includes(needle)) score += 45;

  if (type.includes('common stock') || type.includes('adr') || type.includes('etf')) score += 20;
  if (type.includes('right') || type.includes('warrant') || type.includes('preferred') || type.includes('fund')) score -= 20;
  if (symbol.includes(':')) score -= 8;
  if (symbol.length > 7) score -= 5;

  return score;
};

const buildSyntheticCandles = (price, previousClose = null, points = 90) => {
  const current = toFinite(price);
  const prev = toFinite(previousClose);
  if (!current || current <= 0) return null;
  const start = prev && prev > 0 ? prev : current;
  const step = points > 1 ? (current - start) / (points - 1) : 0;
  const c = Array.from({ length: points }, (_, idx) => Number((start + step * idx).toFixed(6)));
  return {
    s: 'ok',
    c,
    h: c.map((v) => Number((v * 1.002).toFixed(6))),
    l: c.map((v) => Number((v * 0.998).toFixed(6))),
    v: c.map(() => 0)
  };
};

const isFinnhubUnavailable = (error) =>
  error?.code === 'FINNHUB_ENDPOINT_FORBIDDEN' ||
  error?.code === 'FINNHUB_RATE_LIMIT' ||
  error?.status === 403 ||
  error?.status === 429;

const symbolBasePrice = (symbol) => {
  const normalized = String(symbol || '').toUpperCase();
  if (!normalized) return 100;

  if (normalized.endsWith('USDT')) {
    if (normalized.startsWith('BTC')) return 60000;
    if (normalized.startsWith('ETH')) return 3000;
    if (normalized.startsWith('SOL')) return 150;
    return 100;
  }

  if (normalized.includes('_')) {
    if (normalized === 'USD_JPY') return 150;
    if (normalized === 'USD_CHF') return 0.9;
    if (normalized === 'USD_CAD') return 1.35;
    return 1.1;
  }

  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  return 40 + (hash % 460);
};

const syntheticQuote = (symbol, retryAfterMs = 0) => {
  const c = Number(symbolBasePrice(symbol).toFixed(6));
  return {
    c,
    pc: c,
    d: 0,
    dp: 0,
    h: c,
    l: c,
    o: c,
    t: Math.floor(Date.now() / 1000),
    fallback: true,
    retryAfterMs: Number(retryAfterMs) || 0
  };
};

const toYahooSymbol = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  if (upper.includes('_')) {
    const [fromCurrency, toCurrency] = upper.split('_');
    if (!fromCurrency || !toCurrency) return null;
    return `${fromCurrency}${toCurrency}=X`;
  }
  if (upper.endsWith('USDT')) {
    const base = upper.replace(/USDT$/, '');
    return base ? `${base}-USD` : null;
  }
  return upper;
};

const resolveAlphaFallbackQuote = async (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  try {
    if (upper.includes('_')) {
      const [fromCurrency, toCurrency] = upper.split('_');
      if (!fromCurrency || !toCurrency) return null;
      const raw = await av.fxRate(fromCurrency, toCurrency);
      const node = raw?.['Realtime Currency Exchange Rate'] || {};
      const price = toFinite(node?.['5. Exchange Rate']);
      if (!Number.isFinite(price) || price <= 0) return null;
      return { c: price, pc: price, dp: 0, fallback: true, provider: 'alphavantage' };
    }

    if (upper.endsWith('USDT')) {
      const base = upper.replace(/USDT$/, '');
      if (!base) return null;
      const raw = await av.digitalDaily(base, 'USD');
      const series = raw?.['Time Series (Digital Currency Daily)'];
      const rows = series && typeof series === 'object' ? Object.values(series) : [];
      const current = toFinite(rows?.[0]?.['4a. close (USD)']);
      const previous = toFinite(rows?.[1]?.['4a. close (USD)']);
      if (!Number.isFinite(current) || current <= 0) return null;
      const pc = Number.isFinite(previous) && previous > 0 ? previous : current;
      const dp = pc > 0 ? ((current - pc) / pc) * 100 : 0;
      return { c: current, pc, dp, fallback: true, provider: 'alphavantage' };
    }

    const raw = await av.globalQuote(upper);
    const node = raw?.['Global Quote'] || {};
    const price = toFinite(node?.['05. price']);
    const previousClose = toFinite(node?.['08. previous close']);
    const changePercentRaw = String(node?.['10. change percent'] || '').replace('%', '');
    const parsedChange = toFinite(changePercentRaw);
    if (!Number.isFinite(price) || price <= 0) return null;
    const pc = Number.isFinite(previousClose) && previousClose > 0 ? previousClose : price;
    const dp = Number.isFinite(parsedChange) ? parsedChange : pc > 0 ? ((price - pc) / pc) * 100 : 0;
    return { c: price, pc, dp, fallback: true, provider: 'alphavantage' };
  } catch {
    return null;
  }
};

const resolveYahooFallbackQuote = async (symbol) => {
  const yahooSymbol = toYahooSymbol(symbol);
  if (!yahooSymbol) return null;
  try {
    const qs = new URLSearchParams({ symbols: yahooSymbol });
    const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?${qs.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.quoteResponse?.result?.[0];
    if (!item) return null;
    const price = toFinite(item.regularMarketPrice);
    const previousClose = toFinite(item.regularMarketPreviousClose);
    const changePercent = toFinite(item.regularMarketChangePercent);
    if (!Number.isFinite(price) || price <= 0) return null;
    const pc = Number.isFinite(previousClose) && previousClose > 0 ? previousClose : price;
    const dp = Number.isFinite(changePercent) ? changePercent : pc > 0 ? ((price - pc) / pc) * 100 : 0;
    return { c: price, pc, dp, fallback: true, provider: 'yahoo' };
  } catch {
    return null;
  }
};

router.get('/quote', async (req, res, next) => {
  try {
    if (!req.query.symbol) throw badRequest('symbol requerido');
    let data;
    try {
      data = await finnhub.quote(req.query.symbol);
    } catch (error) {
      if (!isFinnhubUnavailable(error)) throw error;
      data =
        (await resolveAlphaFallbackQuote(req.query.symbol)) ||
        (await resolveYahooFallbackQuote(req.query.symbol)) ||
        syntheticQuote(req.query.symbol, error?.retryAfterMs);
    }
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/candles', async (req, res, next) => {
  try {
    const { symbol, resolution = 'D', from, to } = req.query;
    if (!symbol || !from || !to) throw badRequest('symbol/from/to requeridos');
    const key = `candles:${symbol}:${resolution}:${from}:${to}`;
    const data = await getOrSet(key, 300, async () => {
      try {
        return await finnhub.candles(symbol, resolution, from, to);
      } catch (error) {
        if (!isFinnhubUnavailable(error)) throw error;
        const quote = syntheticQuote(symbol, error?.retryAfterMs);
        return buildSyntheticCandles(quote.c, quote.pc);
      }
    });
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/crypto-candles', async (req, res, next) => {
  try {
    const { symbol, resolution = 'D', from, to } = req.query;
    if (!symbol || !from || !to) throw badRequest('symbol/from/to requeridos');
    const key = `crypto:${symbol}:${resolution}:${from}:${to}`;
    const data = await getOrSet(key, 300, async () => {
      try {
        return await finnhub.cryptoCandles(symbol, resolution, from, to);
      } catch (error) {
        if (!isFinnhubUnavailable(error)) throw error;
        const quote = syntheticQuote(symbol, error?.retryAfterMs);
        return buildSyntheticCandles(quote.c, quote.pc);
      }
    });
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/forex-candles', async (req, res, next) => {
  try {
    const { from, to, resolution = 'D', fromTs, toTs } = req.query;
    if (!from || !to || !fromTs || !toTs) throw badRequest('from/to/fromTs/toTs requeridos');
    const key = `fx:${from}:${to}:${resolution}:${fromTs}:${toTs}`;
    const pair = `${String(from).toUpperCase()}_${String(to).toUpperCase()}`;
    const data = await getOrSet(key, 300, async () => {
      try {
        return await finnhub.forexCandles(from, to, resolution, fromTs, toTs);
      } catch (error) {
        if (!isFinnhubUnavailable(error)) throw error;
        const quote = syntheticQuote(pair, error?.retryAfterMs);
        return buildSyntheticCandles(quote.c, quote.pc);
      }
    });
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/snapshot', async (req, res, next) => {
  try {
    const symbols = normalizeSymbolList(req.query.symbols);
    if (!symbols.length) throw badRequest('symbols requerido');

    const items = [];
    const errors = [];

    for (const symbol of symbols) {
      const cacheKey = `snapshot:${symbol}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        items.push(cached);
        continue;
      }

      try {
        let quoteSymbol = symbol;
        if (symbol.endsWith('USDT')) quoteSymbol = `BINANCE:${symbol}`;
        if (symbol.includes('_')) quoteSymbol = `OANDA:${symbol}`;

        let quote;
        try {
          quote = await finnhub.quote(quoteSymbol);
        } catch (error) {
          if (!isFinnhubUnavailable(error)) throw error;
          quote = (await resolveAlphaFallbackQuote(symbol)) || (await resolveYahooFallbackQuote(symbol)) || syntheticQuote(symbol, error?.retryAfterMs);
        }
        const price = toFinite(quote?.c);
        const previousClose = toFinite(quote?.pc);
        if (!price || price <= 0) throw new Error('invalid quote');

        const snapshot = {
          symbol,
          quote: {
            c: price,
            pc: previousClose ?? price,
            dp: toFinite(quote?.dp) ?? 0
          },
          candles: buildSyntheticCandles(price, previousClose)
        };

        cache.set(cacheKey, snapshot, 45);
        items.push(snapshot);
      } catch (error) {
        errors.push({
          symbol,
          code: error?.code || 'SNAPSHOT_FAILED',
          message: error?.message || 'snapshot failed'
        });
      }
    }

    return res.json({
      items,
      errors,
      total: symbols.length,
      count: items.length
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/commodity', async (req, res, next) => {
  try {
    const fn = req.query.function;
    if (!fn) throw badRequest('function requerido');
    const extraParams = Object.fromEntries(
      Object.entries(req.query || {}).filter(([k]) => !['function'].includes(String(k || '').toLowerCase()))
    );
    const keySuffix = Object.entries(extraParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
    const cacheKey = keySuffix ? `commodity:${fn}:${keySuffix}` : `commodity:${fn}`;
    const raw = await getOrSet(cacheKey, 300, () => av.commodity(fn, extraParams));
    const prices = Array.isArray(raw.data) ? raw.data.map((x) => Number(x.value)).filter((x) => Number.isFinite(x)) : [];
    return res.json({ prices, timestamps: raw.data?.map((x) => x.date) || [], current: prices[0] || null, raw });
  } catch (error) {
    return next(error);
  }
});

router.get('/news', async (req, res, next) => {
  try {
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    let data = [];

    if (symbol) {
      const to = String(req.query.to || new Date().toISOString().slice(0, 10));
      const from = String(req.query.from || new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10));
      const key = `news:company:${symbol}:${from}:${to}`;
      data = await getOrSet(key, 900, () => finnhub.companyNews(symbol, from, to));
    } else {
      const category = String(req.query.category || 'general').trim().toLowerCase() || 'general';
      const minId = Number.isFinite(Number(req.query.minId)) ? Number(req.query.minId) : 0;
      const key = `news:general:${category}:${minId}`;
      data = await getOrSet(key, 900, () => finnhub.generalNews(category, minId));
    }

    return res.json(Array.isArray(data) ? data : []);
  } catch (error) {
    return next(error);
  }
});

router.get('/news/recommended', async (req, res, next) => {
  try {
    const symbols = normalizeSymbolList(req.query.symbols).slice(0, 8);
    const category = String(req.query.category || 'general').trim().toLowerCase() || 'general';
    const minId = Number.isFinite(Number(req.query.minId)) ? Number(req.query.minId) : 0;
    const minScore = Number.isFinite(Number(req.query.minScore)) ? Number(req.query.minScore) : 6;
    const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 60;
    const maxAgeHours = Number.isFinite(Number(req.query.maxAgeHours)) ? Number(req.query.maxAgeHours) : 48;
    const strictImpact = String(req.query.strictImpact || '1') !== '0';
    const to = String(req.query.to || new Date().toISOString().slice(0, 10));
    const from = String(req.query.from || new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10));

    const recommendedCategories = Array.from(new Set([category, 'general', 'forex', 'crypto']));
    const categoryBuckets = await Promise.all(
      recommendedCategories.map((cat) => {
        const key = `news:recommended:general:${cat}:${minId}`;
        return getOrSet(key, 900, () => finnhub.generalNews(cat, minId)).catch(() => []);
      })
    );

    const companyBuckets = await Promise.all(
      symbols.map((symbol) => {
        const key = `news:recommended:company:${symbol}:${from}:${to}`;
        return getOrSet(key, 900, () => finnhub.companyNews(symbol, from, to)).catch(() => []);
      })
    );

    const merged = new Map();
    for (const item of [...categoryBuckets.flat(), ...companyBuckets.flat()]) {
      const key = item?.id || item?.url;
      if (!key || merged.has(key)) continue;
      merged.set(key, item);
    }

    const themeCtrBoost = await getThemeCtrBoost(req.user?.id, 14);
    const ranked = rankNews([...merged.values()], {
      watchlistSymbols: symbols,
      minScore,
      limit,
      maxAgeHours,
      strictImpact,
      themeCtrBoost
    });

    return res.json({
      mode: 'ai',
      minScore,
      maxAgeHours,
      strictImpact,
      total: merged.size,
      count: ranked.length,
      items: ranked
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/news/telemetry', async (req, res, next) => {
  try {
    const eventType = String(req.body?.eventType || '').trim().toLowerCase();
    if (!['impression', 'click'].includes(eventType)) throw badRequest('eventType inválido');
    const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = incoming.slice(0, 60).map((item) => ({
      itemKey: String(item?.id || item?.url || item?.headline || '').trim().slice(0, 255),
      theme: String(item?.theme || item?.aiTheme || 'global').trim().toLowerCase().slice(0, 64) || 'global',
      score: Number.isFinite(Number(item?.score ?? item?.aiScore)) ? Number(item?.score ?? item?.aiScore) : null,
      headline: String(item?.headline || '').trim().slice(0, 500)
    })).filter((item) => item.itemKey);
    if (!items.length) return res.status(201).json({ ok: true, inserted: 0 });

    try {
      await ensureNewsTelemetryTable();
      for (const item of items) {
        // Keep simple inserts; volume is low and easier to reason about on failures.
        await query(
          `INSERT INTO news_telemetry_events (user_id, event_type, item_key, theme, score, headline)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.user.id, eventType, item.itemKey, item.theme, item.score, item.headline || null]
        );
      }
    } catch {
      // Best effort telemetry: never block market/news UX.
      return res.status(201).json({ ok: true, inserted: 0, persisted: false });
    }

    return res.status(201).json({ ok: true, inserted: items.length, persisted: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/news/telemetry/summary', async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(30, Number(req.query.days || 7)));
    try {
      await ensureNewsTelemetryTable();
      const [totalsOut, byThemeOut] = await Promise.all([
        query(
          `SELECT
             COUNT(*) FILTER (WHERE event_type = 'impression')::int AS impressions,
             COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks
           FROM news_telemetry_events
           WHERE user_id = $1 AND created_at >= NOW() - ($2::text || ' days')::interval`,
          [req.user.id, String(days)]
        ),
        query(
          `SELECT
             theme,
             COUNT(*) FILTER (WHERE event_type = 'impression')::int AS impressions,
             COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks
           FROM news_telemetry_events
           WHERE user_id = $1 AND created_at >= NOW() - ($2::text || ' days')::interval
           GROUP BY theme
           ORDER BY clicks DESC, impressions DESC`,
          [req.user.id, String(days)]
        )
      ]);
      const totals = totalsOut.rows[0] || { impressions: 0, clicks: 0 };
      const impressions = Number(totals.impressions || 0);
      const clicks = Number(totals.clicks || 0);
      return res.json({
        days,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        byTheme: (byThemeOut.rows || []).map((row) => {
          const imp = Number(row.impressions || 0);
          const clk = Number(row.clicks || 0);
          return {
            theme: row.theme,
            impressions: imp,
            clicks: clk,
            ctr: imp > 0 ? (clk / imp) * 100 : 0
          };
        })
      });
    } catch {
      return res.json({ days, impressions: 0, clicks: 0, ctr: 0, byTheme: [], persisted: false });
    }
  } catch (error) {
    return next(error);
  }
});

router.delete('/news/telemetry/summary', async (req, res, next) => {
  try {
    try {
      await ensureNewsTelemetryTable();
      await query('DELETE FROM news_telemetry_events WHERE user_id = $1', [req.user.id]);
      return res.json({ ok: true, persisted: true });
    } catch {
      return res.json({ ok: true, persisted: false });
    }
  } catch (error) {
    return next(error);
  }
});

router.get('/profile', async (req, res, next) => {
  try {
    const { symbol } = req.query;
    if (!symbol) throw badRequest('symbol requerido');
    const data = await getOrSet(`profile:${symbol}`, 86400, async () => {
      const [finn, over] = await Promise.all([finnhub.profile(symbol), av.overview(symbol)]);
      return {
        name: finn.name || over.Name,
        sector: finn.finnhubIndustry || over.Sector,
        marketCap: finn.marketCapitalization || over.MarketCapitalization,
        pe: over.PERatio,
        dividendYield: over.DividendYield
      };
    });
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/universe', async (_req, res) => {
  const categories = Array.from(new Set(MARKET_UNIVERSE.map((item) => item.category)));
  return res.json({
    assets: MARKET_UNIVERSE,
    categories,
    count: MARKET_UNIVERSE.length
  });
});

router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ items: [], count: 0, q });

    const cachedUniverse = MARKET_UNIVERSE.filter((item) => {
      const symbol = normalizeSearchText(item.symbol);
      const name = normalizeSearchText(item.name);
      const needle = normalizeSearchText(q);
      return symbol.includes(needle) || name.includes(needle);
    }).slice(0, 20);

    const key = `market:search:${normalizeSearchText(q)}`;
    const remote = await getOrSet(key, 600, async () => {
      try {
        const out = await finnhub.symbolSearch(q);
        const rows = Array.isArray(out?.result) ? out.result : [];
        return rows
          .filter((item) => String(item?.symbol || '').trim() && String(item?.description || '').trim())
          .sort((a, b) => scoreSearchResult(q, b) - scoreSearchResult(q, a))
          .slice(0, 20)
          .map((item) => {
            const symbol = String(item.symbol || '').trim().toUpperCase();
            const description = String(item.description || '').trim();
            const type = String(item.type || '').trim().toLowerCase();
            const category = type.includes('crypto')
              ? 'crypto'
              : type.includes('forex') || symbol.includes('_')
                ? 'fx'
                : type.includes('etf')
                  ? 'equity'
                  : 'equity';
            return {
              symbol,
              name: description,
              category,
              source: category === 'crypto' ? 'finnhub_crypto' : category === 'fx' ? 'finnhub_fx' : 'finnhub_stock'
            };
          });
      } catch {
        return [];
      }
    });

    const merged = new Map();
    [...cachedUniverse, ...(Array.isArray(remote) ? remote : [])].forEach((item) => {
      const symbol = String(item?.symbol || '').toUpperCase();
      if (!symbol || merged.has(symbol)) return;
      merged.set(symbol, {
        symbol,
        name: String(item?.name || ''),
        category: String(item?.category || 'equity'),
        source: String(item?.source || (symbol.endsWith('USDT') ? 'finnhub_crypto' : symbol.includes('_') ? 'finnhub_fx' : 'finnhub_stock'))
      });
    });

    const items = [...merged.values()].slice(0, 20);
    return res.json({ items, count: items.length, q });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
