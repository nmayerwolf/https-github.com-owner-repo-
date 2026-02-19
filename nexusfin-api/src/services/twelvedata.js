const { env } = require('../config/env');

const BASE = 'https://api.twelvedata.com';

const ErrorCodes = {
  KEY_MISSING: 'KEY_MISSING',
  PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',
  SYMBOL_UNSUPPORTED: 'SYMBOL_UNSUPPORTED',
  RATE_LIMITED: 'RATE_LIMITED',
  NO_LIVE_DATA: 'NO_LIVE_DATA',
  PROVIDER_ERROR: 'PROVIDER_ERROR'
};

class TwelveDataError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TwelveDataError';
    this.code = code;
    this.details = details;
  }
}

const metrics = {
  ok: 0,
  fail: 0,
  byCode: {},
  bySymbol: {}
};

const bumpMetric = (symbol, code = null, ok = false) => {
  const normalized = String(symbol || '').toUpperCase() || 'UNKNOWN';
  if (!metrics.bySymbol[normalized]) {
    metrics.bySymbol[normalized] = { ok: 0, fail: 0 };
  }
  if (ok) {
    metrics.ok += 1;
    metrics.bySymbol[normalized].ok += 1;
    return;
  }
  metrics.fail += 1;
  metrics.bySymbol[normalized].fail += 1;
  const codeKey = String(code || ErrorCodes.PROVIDER_ERROR);
  metrics.byCode[codeKey] = (metrics.byCode[codeKey] || 0) + 1;
};

const sanitizeApiKey = (raw) => {
  const key = String(raw || '').trim();
  if (!key) return '';
  // Railway values occasionally include surrounding quotes from copy/paste.
  return key.replace(/^['"]+|['"]+$/g, '').trim();
};

const createTwelveDataService = (options = {}) => {
  const base = options.base || BASE;
  const fetchImpl = options.fetchImpl || fetch;
  const keyProvider = options.keyProvider || (() => env.twelveDataKey);
  const logger = options.logger || console;

  const apiKey = () => sanitizeApiKey(keyProvider());
  const hasKey = () => apiKey().length > 0;
  const keyLength = () => apiKey().length;

  const fetchTwelve = async (path, params = {}) => {
    const apikey = apiKey();
    const symbol = String(params?.symbol || '').toUpperCase();

    if (!apikey) {
      const error = new TwelveDataError(ErrorCodes.KEY_MISSING, 'TWELVE_DATA_KEY not configured');
      bumpMetric(symbol, error.code, false);
      throw error;
    }

    const qs = new URLSearchParams({ ...params, apikey });
    const url = `${base}${path}?${qs.toString()}`;
    const startedAt = Date.now();
    let res;

    try {
      res = await fetchImpl(url);
    } catch (error) {
      const duration = Date.now() - startedAt;
      logger.error(`[twelvedata] NETWORK_ERROR ${path} ${symbol} ${duration}ms`, error?.message || error);
      const out = new TwelveDataError(ErrorCodes.NO_LIVE_DATA, `Network error: ${error?.message || 'unknown'}`, {
        path,
        symbol,
        duration
      });
      bumpMetric(symbol, out.code, false);
      throw out;
    }

    const duration = Date.now() - startedAt;

    if (res.status === 401 || res.status === 403) {
      logger.error(`[twelvedata] AUTH_FAILED ${path} ${symbol} HTTP${res.status} ${duration}ms`);
      const out = new TwelveDataError(
        ErrorCodes.PROVIDER_AUTH_FAILED,
        `Twelve Data auth failed (HTTP ${res.status})`,
        { path, symbol, status: res.status, duration }
      );
      bumpMetric(symbol, out.code, false);
      throw out;
    }

    if (res.status === 429) {
      logger.warn(`[twelvedata] RATE_LIMITED ${path} ${symbol} ${duration}ms`);
      const out = new TwelveDataError(ErrorCodes.RATE_LIMITED, 'Twelve Data rate limit reached', {
        path,
        symbol,
        status: res.status,
        duration
      });
      bumpMetric(symbol, out.code, false);
      throw out;
    }

    if (!res.ok) {
      logger.error(`[twelvedata] HTTP_ERROR ${path} ${symbol} HTTP${res.status} ${duration}ms`);
      const out = new TwelveDataError(ErrorCodes.PROVIDER_ERROR, `Twelve Data HTTP ${res.status}`, {
        path,
        symbol,
        status: res.status,
        duration
      });
      bumpMetric(symbol, out.code, false);
      throw out;
    }

    const body = await res.json();

    if (String(body?.status || '').toLowerCase() === 'error' || body?.code) {
      const message = String(body?.message || body?.code || 'Unknown Twelve Data error');
      const code = /not found|no data|invalid.*symbol|symbol.*missing/i.test(message)
        ? ErrorCodes.SYMBOL_UNSUPPORTED
        : ErrorCodes.PROVIDER_ERROR;
      logger.warn(`[twelvedata] API_ERROR ${path} ${symbol} \"${message}\" ${duration}ms`);
      const out = new TwelveDataError(code, message, {
        path,
        symbol,
        rawCode: body?.code || null,
        duration
      });
      bumpMetric(symbol, out.code, false);
      throw out;
    }

    logger.log(`[twelvedata] OK ${path} ${symbol} ${duration}ms`);
    bumpMetric(symbol, null, true);
    return body;
  };

  return {
    hasKey,
    keyLength,
    quote: (symbol) => fetchTwelve('/quote', { symbol }),
    price: (symbol) => fetchTwelve('/price', { symbol }),
    symbolSearch: (q, outputsize = 20) => fetchTwelve('/symbol_search', { symbol: q, outputsize }),
    timeSeries: (symbol, interval = '1day', outputsize = 120) => fetchTwelve('/time_series', { symbol, interval, outputsize })
  };
};

const service = createTwelveDataService();

const getMetrics = () => {
  const failedSymbols = Object.entries(metrics.bySymbol)
    .filter(([, values]) => Number(values?.fail || 0) > 0)
    .map(([symbol]) => symbol)
    .slice(0, 30);

  return {
    ok: metrics.ok,
    fail: metrics.fail,
    byCode: { ...metrics.byCode },
    bySymbol: Object.fromEntries(Object.entries(metrics.bySymbol).slice(0, 100)),
    failedSymbols
  };
};

module.exports = {
  ...service,
  createTwelveDataService,
  ErrorCodes,
  TwelveDataError,
  getMetrics,
  sanitizeApiKey
};
