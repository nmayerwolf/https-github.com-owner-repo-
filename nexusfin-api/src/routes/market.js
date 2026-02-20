const express = require('express');
const { cache } = require('../config/cache');
const { query } = require('../config/db');
const finnhub = require('../services/finnhub');
const {
  resolveMarketQuote,
  resolveMarketSearch,
  resolveMarketCandles,
  ErrorCodes
} = require('../services/marketDataProvider');
const { rankNews } = require('../services/newsRanker');
const { badRequest } = require('../utils/errors');
const { MARKET_UNIVERSE } = require('../constants/marketUniverse');

const router = express.Router();
let newsTelemetryReady = false;
const MAX_MARKET_WATCHLIST_SYMBOLS = 15;
const SYMBOL_PATTERN = /^[A-Z0-9.^/_:-]{1,24}$/;
const LIVE_ERROR_CODES = new Set(
  [
    ErrorCodes?.NO_LIVE_DATA,
    ErrorCodes?.SYMBOL_UNSUPPORTED,
    ErrorCodes?.RATE_LIMITED,
    ErrorCodes?.PROVIDER_AUTH_FAILED,
    'NO_LIVE_DATA',
    'SYMBOL_UNSUPPORTED',
    'RATE_LIMITED',
    'PROVIDER_AUTH_FAILED'
  ].filter(Boolean)
);

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

const normalizeSymbol = (value) => String(value || '').trim().toUpperCase();

const normalizeWatchlistCategory = (symbol, incomingCategory = '') => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const category = String(incomingCategory || '').trim().toLowerCase();
  if (category) return category;
  if (normalizedSymbol.endsWith('USDT')) return 'crypto';
  if (normalizedSymbol.includes('_')) return 'fx';
  return 'equity';
};

const normalizeWatchlistType = (category) => {
  const normalized = String(category || '').trim().toLowerCase();
  if (normalized === 'crypto') return 'crypto';
  if (normalized === 'fx') return 'forex';
  return 'stock';
};

router.get('/watchlist', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT symbol, name, type, category, added_at FROM watchlist_items WHERE user_id = $1 ORDER BY added_at DESC',
      [req.user.id]
    );
    return res.json({ symbols: rows.rows, max: MAX_MARKET_WATCHLIST_SYMBOLS });
  } catch (error) {
    return next(error);
  }
});

router.put('/watchlist', async (req, res, next) => {
  try {
    const incoming = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
    const unique = Array.from(new Set(incoming.map((x) => normalizeSymbol(x?.symbol || x)).filter(Boolean)));

    if (unique.length > MAX_MARKET_WATCHLIST_SYMBOLS) {
      return res.status(403).json({
        error: 'LIMIT_REACHED',
        message: `Maximo ${MAX_MARKET_WATCHLIST_SYMBOLS} simbolos`
      });
    }

    for (const symbol of unique) {
      if (!SYMBOL_PATTERN.test(symbol)) throw badRequest(`Simbolo invalido: ${symbol}`);
    }

    await query('DELETE FROM watchlist_items WHERE user_id = $1', [req.user.id]);

    const byUniverse = Object.fromEntries(MARKET_UNIVERSE.map((item) => [String(item?.symbol || '').toUpperCase(), item]));
    for (const symbol of unique) {
      const meta = byUniverse[symbol] || {};
      const category = normalizeWatchlistCategory(symbol, meta?.category);
      const type = normalizeWatchlistType(category);
      await query(
        `INSERT INTO watchlist_items (user_id, symbol, name, type, category)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, symbol) DO NOTHING`,
        [req.user.id, symbol, String(meta?.name || symbol), type, category]
      );
    }

    const rows = await query(
      'SELECT symbol, name, type, category, added_at FROM watchlist_items WHERE user_id = $1 ORDER BY added_at DESC',
      [req.user.id]
    );
    return res.json({ ok: true, symbols: rows.rows, max: MAX_MARKET_WATCHLIST_SYMBOLS });
  } catch (error) {
    return next(error);
  }
});

router.get('/prices', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT symbol, name, type, category, added_at FROM watchlist_items WHERE user_id = $1 ORDER BY added_at DESC',
      [req.user.id]
    );
    const symbols = rows.rows.map((row) => normalizeSymbol(row.symbol)).filter(Boolean).slice(0, MAX_MARKET_WATCHLIST_SYMBOLS);
    const out = [];

    for (const symbol of symbols) {
      const cacheKey = `snapshot:${symbol}`;
      const cached = cache.get(cacheKey);
      if (cached?.quote) {
        out.push({
          symbol,
          price: toFinite(cached.quote.c),
          prevClose: toFinite(cached.quote.pc),
          changePct: toFinite(cached.quote.dp),
          source: cached?.marketMeta?.source || 'finnhub',
          asOf: cached?.marketMeta?.asOf || null
        });
        continue;
      }

      try {
        const resolved = await resolveMarketQuote(symbol);
        out.push({
          symbol,
          price: toFinite(resolved?.quote?.c),
          prevClose: toFinite(resolved?.quote?.pc),
          changePct: toFinite(resolved?.quote?.dp),
          source: resolved?.meta?.source || 'finnhub',
          asOf: resolved?.meta?.asOf || null
        });
      } catch {
        out.push({ symbol, price: null, prevClose: null, changePct: null, source: 'finnhub', asOf: null });
      }
    }

    return res.json({ prices: out, count: out.length, max: MAX_MARKET_WATCHLIST_SYMBOLS });
  } catch (error) {
    return next(error);
  }
});

router.get('/quote', async (req, res, next) => {
  try {
    if (!req.query.symbol) throw badRequest('symbol requerido');
    const resolved = await resolveMarketQuote(req.query.symbol);
    return res.json({ ...resolved.quote, source: resolved.meta.source, asOf: resolved.meta.asOf, stale: resolved.meta.stale });
  } catch (error) {
    if (LIVE_ERROR_CODES.has(error?.code)) {
      return res.status(503).json({
        error: error?.code || 'NO_LIVE_DATA',
        message: error?.message || 'No live data available',
        symbol: String(req.query.symbol || '').toUpperCase(),
        details: error?.details || null
      });
    }
    return next(error);
  }
});

router.get('/candles', async (req, res, next) => {
  try {
    const { symbol, resolution = 'D', from, to } = req.query;
    if (!symbol || !from || !to) throw badRequest('symbol/from/to requeridos');
    const key = `candles:${symbol}:${resolution}:${from}:${to}`;
    const data = await getOrSet(key, 180, async () => resolveMarketCandles({ symbol, resolution, from, to, outputsize: 120 }));
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
    const data = await getOrSet(key, 180, async () => resolveMarketCandles({ symbol, resolution, from, to, outputsize: 120 }));
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
    const data = await getOrSet(key, 180, async () => resolveMarketCandles({ symbol: pair, resolution, from: fromTs, to: toTs, outputsize: 120 }));
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
        const resolved = await resolveMarketQuote(symbol);
        const quote = resolved.quote;
        const price = toFinite(quote?.c);
        const previousClose = toFinite(quote?.pc);
        if (!price || price <= 0) throw new Error('invalid quote');

        const candles = await resolveMarketCandles({ symbol, resolution: 'D', outputsize: 90 }).catch(() => ({
          s: 'no_data',
          c: [],
          h: [],
          l: [],
          v: []
        }));

        const snapshot = {
          symbol,
          quote: {
            c: price,
            pc: previousClose ?? price,
            dp: toFinite(quote?.dp) ?? 0
          },
          candles,
          marketMeta: resolved.meta
        };

        cache.set(cacheKey, snapshot, 45);
        items.push(snapshot);
      } catch (error) {
        const missing = {
          symbol,
          quote: { c: null, pc: null, dp: null },
          candles: { s: 'no_data', c: [], h: [], l: [], v: [] },
          marketMeta: {
            source: 'finnhub',
            asOf: new Date().toISOString(),
            stale: false,
            unavailable: true,
            error: {
              code: error?.code || 'NO_LIVE_DATA',
              message: error?.message || 'No live quote available'
            }
          }
        };
        items.push(missing);
        errors.push({
          symbol,
          code: error?.code || 'NO_LIVE_DATA',
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
    return res.json({ prices: [], timestamps: [], current: null, message: 'Commodity data via ETFs and symbols in market universe' });
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
    const upper = String(symbol).trim().toUpperCase();
    const data = await getOrSet(`profile:${upper}`, 86400, async () => {
      const entry = MARKET_UNIVERSE.find((item) => String(item?.symbol || '').toUpperCase() === upper);
      return {
        name: entry?.name || upper,
        sector: entry?.category || null,
        marketCap: null,
        pe: null,
        dividendYield: null
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
    const remote = await getOrSet(key, 600, async () => resolveMarketSearch(q));

    const merged = new Map();
    [...cachedUniverse, ...(Array.isArray(remote) ? remote : [])].forEach((item) => {
      const symbol = String(item?.symbol || '').toUpperCase();
      if (!symbol || merged.has(symbol)) return;
      merged.set(symbol, {
        symbol,
        name: String(item?.name || ''),
        category: String(item?.category || 'equity'),
        source: 'finnhub'
      });
    });

    const items = [...merged.values()].slice(0, 20);
    return res.json({ items, count: items.length, q });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
