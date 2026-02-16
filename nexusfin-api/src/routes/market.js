const express = require('express');
const { cache } = require('../config/cache');
const av = require('../services/alphavantage');
const finnhub = require('../services/finnhub');
const { rankNews } = require('../services/newsRanker');
const { badRequest } = require('../utils/errors');
const { MARKET_UNIVERSE } = require('../constants/marketUniverse');

const router = express.Router();

const getOrSet = async (key, ttlSec, fn) => {
  const cached = cache.get(key);
  if (cached) return cached;
  const value = await fn();
  cache.set(key, value, ttlSec);
  return value;
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

router.get('/quote', async (req, res, next) => {
  try {
    if (!req.query.symbol) throw badRequest('symbol requerido');
    let data;
    try {
      data = await finnhub.quote(req.query.symbol);
    } catch (error) {
      if (!isFinnhubUnavailable(error)) throw error;
      data = syntheticQuote(req.query.symbol, error?.retryAfterMs);
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
          quote = syntheticQuote(symbol, error?.retryAfterMs);
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
    const to = String(req.query.to || new Date().toISOString().slice(0, 10));
    const from = String(req.query.from || new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10));

    const generalKey = `news:recommended:general:${category}:${minId}`;
    const general = await getOrSet(generalKey, 900, () => finnhub.generalNews(category, minId));

    const companyBuckets = await Promise.all(
      symbols.map((symbol) => {
        const key = `news:recommended:company:${symbol}:${from}:${to}`;
        return getOrSet(key, 900, () => finnhub.companyNews(symbol, from, to)).catch(() => []);
      })
    );

    const merged = new Map();
    for (const item of [...(Array.isArray(general) ? general : []), ...companyBuckets.flat()]) {
      const key = item?.id || item?.url;
      if (!key || merged.has(key)) continue;
      merged.set(key, item);
    }

    const ranked = rankNews([...merged.values()], {
      watchlistSymbols: symbols,
      minScore,
      limit
    });

    return res.json({
      mode: 'ai',
      minScore,
      total: merged.size,
      count: ranked.length,
      items: ranked
    });
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

module.exports = router;
