const BASE = 'https://www.alphavantage.co/query';
const KEY = import.meta.env.VITE_ALPHA_VANTAGE_KEY || 'UFZ6W2F1RUPUGVWF';
let lastCallAt = 0;

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
  const wait = 12500 - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
  stats.calls += 1;
  stats.lastCallAt = Date.now();

  const qs = new URLSearchParams({ ...params, apikey: KEY });
  const res = await fetch(`${BASE}?${qs}`);
  if (res.status === 429) stats.rateLimited += 1;
  if (!res.ok) {
    stats.errors += 1;
    stats.lastError = `HTTP ${res.status} for ${params.function}`;
    throw new Error(`Alpha Vantage ${res.status}`);
  }
  return res.json();
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
  const data = payload?.data;
  if (!Array.isArray(data)) return null;

  const values = data
    .map((x) => toNumber(x.value))
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
    return await getCachedOrFetch(`overview_${symbol}`, { function: 'OVERVIEW', symbol });
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
