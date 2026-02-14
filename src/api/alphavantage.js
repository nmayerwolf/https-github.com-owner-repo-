import { api } from './apiClient';

const CACHE_KEY = 'nexusfin_av_cache_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const stats = {
  calls: 0,
  errors: 0,
  rateLimited: 0,
  cacheHits: 0,
  lastError: '',
  lastCallAt: 0
};

const MACRO_SERIES = [
  { symbol: 'XAU', name: 'Gold Spot', category: 'metal', sector: 'metals', fn: 'GOLD', params: { interval: 'daily' } },
  { symbol: 'XAG', name: 'Silver Spot', category: 'metal', sector: 'metals', fn: 'SILVER', params: { interval: 'daily' } },
  { symbol: 'XPT', name: 'Platinum Spot', category: 'metal', sector: 'metals', fn: 'PLATINUM', params: { interval: 'daily' } },
  { symbol: 'XCU', name: 'Copper Spot', category: 'commodity', sector: 'energy', fn: 'COPPER', params: { interval: 'daily' } },
  { symbol: 'CL', name: 'Crude Oil WTI', category: 'commodity', sector: 'energy', fn: 'WTI', params: { interval: 'daily' } },
  { symbol: 'BRN', name: 'Crude Oil Brent', category: 'commodity', sector: 'energy', fn: 'BRENT', params: { interval: 'daily' } },
  { symbol: 'NG', name: 'Natural Gas', category: 'commodity', sector: 'energy', fn: 'NATURAL_GAS', params: { interval: 'daily' } },
  { symbol: 'US2Y', name: 'US 2Y Treasury', category: 'bond', sector: 'bonds', fn: 'TREASURY_YIELD', params: { interval: 'daily', maturity: '2year' } },
  { symbol: 'US5Y', name: 'US 5Y Treasury', category: 'bond', sector: 'bonds', fn: 'TREASURY_YIELD', params: { interval: 'daily', maturity: '5year' } },
  { symbol: 'US10Y', name: 'US 10Y Treasury', category: 'bond', sector: 'bonds', fn: 'TREASURY_YIELD', params: { interval: 'daily', maturity: '10year' } },
  { symbol: 'US30Y', name: 'US 30Y Treasury', category: 'bond', sector: 'bonds', fn: 'TREASURY_YIELD', params: { interval: 'daily', maturity: '30year' } }
];

const macroCacheId = (entry) => {
  const suffix = Object.entries(entry.params || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}_${String(v).toLowerCase()}`)
    .join('_');
  return suffix ? `macro_${entry.fn}_${suffix}` : `macro_${entry.fn}`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeCache = (cache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache write failures.
  }
};

const limitedGet = async (params) => {
  // Keep a small jitter to avoid burst requests from the browser.
  await sleep(120);
  stats.calls += 1;
  stats.lastCallAt = Date.now();
  const fn = params?.function;
  if (!fn) throw new Error('Alpha function requerida');
  const { function: _ignored, ...rest } = params || {};
  try {
    return await api.commodity(fn, rest);
  } catch (error) {
    if (error?.status === 429) stats.rateLimited += 1;
    throw error;
  }
};

const getCachedOrFetch = async (cacheId, params) => {
  const cache = readCache();
  const item = cache[cacheId];
  if (item && Date.now() - item.ts < CACHE_TTL_MS) {
    stats.cacheHits += 1;
    return item.data;
  }

  const data = await limitedGet(params);
  cache[cacheId] = { ts: Date.now(), data };
  writeCache(cache);
  return data;
};

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const parseMacroSeries = (payload) => {
  const prices = Array.isArray(payload?.prices) ? payload.prices : [];
  if (!prices.length) return null;
  const values = prices
    .map((x) => toNumber(x))
    .filter((x) => Number.isFinite(x))
    .slice(0, 120)
    .reverse();

  if (values.length < 30) return null;

  const last = values[values.length - 1];
  const prev = values[values.length - 2] ?? last;
  const changePercent = prev ? ((last - prev) / prev) * 100 : 0;

  return {
    price: last,
    changePercent,
    candles: {
      c: values,
      h: [...values],
      l: [...values],
      v: values.map(() => 0)
    }
  };
};

export const fetchCompanyOverview = async (symbol) => {
  try {
    return await api.profile(symbol);
  } catch (error) {
    stats.errors += 1;
    stats.lastError = `overview ${symbol}: ${error.message}`;
    return null;
  }
};

export const fetchMacroAssets = async () => {
  const out = [];

  for (const entry of MACRO_SERIES) {
    try {
      const payload = await getCachedOrFetch(macroCacheId(entry), { function: entry.fn, ...entry.params });
      const parsed = parseMacroSeries(payload);
      if (!parsed) continue;

      out.push({
        symbol: entry.symbol,
        name: entry.name,
        category: entry.category,
        sector: entry.sector,
        source: 'alphavantage_macro',
        price: parsed.price,
        changePercent: parsed.changePercent,
        prevClose: parsed.price / (1 + parsed.changePercent / 100),
        candles: parsed.candles
      });
    } catch (error) {
      stats.errors += 1;
      stats.lastError = `${entry.symbol}: ${error.message}`;
    }
  }

  return out;
};

export const getAlphaHealth = () => ({ ...stats });
