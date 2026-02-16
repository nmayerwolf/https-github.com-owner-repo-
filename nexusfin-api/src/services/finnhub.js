const { env } = require('../config/env');

const BASE = 'https://finnhub.io/api/v1';
const MIN_INTERVAL_MS = 1300;
const RATE_LIMIT_COOLDOWN_MS = 65 * 1000;
const ENDPOINT_FORBIDDEN_TTL_MS = 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createFinnhubService = (options = {}) => {
  const base = options.base || BASE;
  const minIntervalMs = Number.isFinite(Number(options.minIntervalMs)) ? Number(options.minIntervalMs) : MIN_INTERVAL_MS;
  const now = options.now || (() => Date.now());
  const wait = options.wait || sleep;
  const fetchImpl = options.fetchImpl || fetch;
  const keyProvider = options.keyProvider || (() => env.finnhubKey);
  const rateLimitCooldownMs = Number.isFinite(Number(options.rateLimitCooldownMs))
    ? Number(options.rateLimitCooldownMs)
    : RATE_LIMIT_COOLDOWN_MS;
  const endpointForbiddenTtlMs = Number.isFinite(Number(options.endpointForbiddenTtlMs))
    ? Number(options.endpointForbiddenTtlMs)
    : ENDPOINT_FORBIDDEN_TTL_MS;

  let lastStartedAt = -minIntervalMs;
  let queue = Promise.resolve();
  let providerBlockedUntil = 0;
  const endpointBlockedUntil = new Map();

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
      const endpointCooldownUntil = Number(endpointBlockedUntil.get(path) || 0);
      const waitMs = Math.max(0, lastStartedAt + minIntervalMs - current, providerBlockedUntil - current, endpointCooldownUntil - current);
      if (waitMs > 0) await wait(waitMs);
      lastStartedAt = now();

      const qs = new URLSearchParams({ ...params, token });
      const res = await fetchImpl(`${base}${path}?${qs}`);
      if (!res.ok) {
        const bodyText = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
        const err = new Error(`Finnhub HTTP ${res.status} ${path}`);
        err.status = res.status;
        err.path = path;
        err.body = bodyText;

        const normalizedBody = String(bodyText || '').toLowerCase();
        const hitRateLimit = res.status === 429 || (res.status === 403 && normalizedBody.includes('limit'));
        if (hitRateLimit) {
          providerBlockedUntil = now() + rateLimitCooldownMs;
          err.code = 'FINNHUB_RATE_LIMIT';
          err.retryAfterMs = rateLimitCooldownMs;
        } else if (res.status === 403) {
          endpointBlockedUntil.set(path, now() + endpointForbiddenTtlMs);
          err.code = 'FINNHUB_ENDPOINT_FORBIDDEN';
          err.retryAfterMs = endpointForbiddenTtlMs;
        }

        throw err;
      }
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
