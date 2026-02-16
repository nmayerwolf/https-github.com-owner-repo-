const { env } = require('../config/env');

const BASE = 'https://finnhub.io/api/v1';
const MIN_INTERVAL_MS = 1300;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createFinnhubService = (options = {}) => {
  const base = options.base || BASE;
  const minIntervalMs = Number.isFinite(Number(options.minIntervalMs)) ? Number(options.minIntervalMs) : MIN_INTERVAL_MS;
  const now = options.now || (() => Date.now());
  const wait = options.wait || sleep;
  const fetchImpl = options.fetchImpl || fetch;
  const keyProvider = options.keyProvider || (() => env.finnhubKey);

  let lastStartedAt = -minIntervalMs;
  let queue = Promise.resolve();

  const enqueue = (fn) => {
    const work = queue.then(fn, fn);
    queue = work.catch(() => {});
    return work;
  };

  const fetchFinnhub = async (path, params = {}) =>
    enqueue(async () => {
      const token = String(keyProvider() || '').trim();
      if (!token) throw new Error('Missing FINNHUB_KEY');

      const current = now();
      const waitMs = Math.max(0, lastStartedAt + minIntervalMs - current);
      if (waitMs > 0) await wait(waitMs);
      lastStartedAt = now();

      const qs = new URLSearchParams({ ...params, token });
      const res = await fetchImpl(`${base}${path}?${qs}`);
      if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
      return res.json();
    });

  return {
    quote: (symbol) => fetchFinnhub('/quote', { symbol }),
    candles: (symbol, resolution, from, to) => fetchFinnhub('/stock/candle', { symbol, resolution, from, to }),
    cryptoCandles: (symbol, resolution, from, to) =>
      fetchFinnhub('/crypto/candle', { symbol: `BINANCE:${symbol}`, resolution, from, to }),
    forexCandles: (from, to, resolution, tsFrom, tsTo) =>
      fetchFinnhub('/forex/candle', { symbol: `OANDA:${from}_${to}`, resolution, from: tsFrom, to: tsTo }),
    profile: (symbol) => fetchFinnhub('/stock/profile2', { symbol }),
    companyNews: (symbol, from, to) => fetchFinnhub('/company-news', { symbol, from, to })
  };
};

const service = createFinnhubService();

module.exports = { ...service, createFinnhubService };
