const express = require('express');
const { cache } = require('../config/cache');
const av = require('../services/alphavantage');
const finnhub = require('../services/finnhub');
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

router.get('/quote', async (req, res, next) => {
  try {
    if (!req.query.symbol) throw badRequest('symbol requerido');
    const data = await finnhub.quote(req.query.symbol);
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
    const data = await getOrSet(key, 300, () => finnhub.candles(symbol, resolution, from, to));
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
    const data = await getOrSet(key, 300, () => finnhub.cryptoCandles(symbol, resolution, from, to));
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
    const data = await getOrSet(key, 300, () => finnhub.forexCandles(from, to, resolution, fromTs, toTs));
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/commodity', async (req, res, next) => {
  try {
    const fn = req.query.function;
    if (!fn) throw badRequest('function requerido');
    const raw = await getOrSet(`commodity:${fn}`, 300, () => av.commodity(fn));
    const prices = Array.isArray(raw.data) ? raw.data.map((x) => Number(x.value)).filter((x) => Number.isFinite(x)) : [];
    return res.json({ prices, timestamps: raw.data?.map((x) => x.date) || [], current: prices[0] || null, raw });
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
