const finnhub = require('./finnhub');
const twelvedata = require('./twelvedata');

const ErrorCodes = {
  KEY_MISSING: 'KEY_MISSING',
  PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',
  SYMBOL_UNSUPPORTED: 'SYMBOL_UNSUPPORTED',
  RATE_LIMITED: 'RATE_LIMITED',
  NO_LIVE_DATA: 'NO_LIVE_DATA',
  PROVIDER_ERROR: 'PROVIDER_ERROR'
};

class MarketProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MarketProviderError';
    this.code = code;
    this.details = details;
  }
}

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const mapInternalToFinnhub = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  if (upper.startsWith('BINANCE:') || upper.startsWith('OANDA:')) return upper;
  if (upper.endsWith('USDT')) return `BINANCE:${upper}`;
  if (upper.includes('_')) return `OANDA:${upper}`;
  return upper;
};

const mapFinnhubToInternal = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  if (upper.startsWith('BINANCE:')) return upper.slice('BINANCE:'.length);
  if (upper.startsWith('OANDA:')) return upper.slice('OANDA:'.length);
  return upper;
};

const mapInternalToTwelve = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  if (upper.endsWith('USDT')) {
    const base = upper.slice(0, -4);
    return `${base}/USD`;
  }
  if (upper.includes('_')) {
    const [base, quote] = upper.split('_');
    if (!base || !quote) return null;
    return `${base}/${quote}`;
  }
  return upper;
};

const normalizeProviderError = (symbol, error = null) => {
  if (error instanceof MarketProviderError) return error;

  const upper = String(symbol || '').toUpperCase();
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || 0);

  if (code === 'FINNHUB_RATE_LIMIT' || status === 429) {
    return new MarketProviderError(ErrorCodes.RATE_LIMITED, `Finnhub rate limit reached for ${upper}`, {
      symbol: upper,
      retryAfterMs: Number(error?.retryAfterMs || 0) || null
    });
  }

  if (code === 'FINNHUB_ENDPOINT_FORBIDDEN' || status === 403) {
    return new MarketProviderError(ErrorCodes.PROVIDER_AUTH_FAILED, `Finnhub auth/plan restriction for ${upper}`, {
      symbol: upper,
      retryAfterMs: Number(error?.retryAfterMs || 0) || null
    });
  }

  if (status === 401) {
    return new MarketProviderError(ErrorCodes.PROVIDER_AUTH_FAILED, `Finnhub auth failed for ${upper}`, {
      symbol: upper
    });
  }

  if (code === 'KEY_MISSING') {
    return new MarketProviderError(ErrorCodes.KEY_MISSING, `No market provider key configured for ${upper}`, {
      symbol: upper
    });
  }

  if (code === 'PROVIDER_AUTH_FAILED') {
    return new MarketProviderError(ErrorCodes.PROVIDER_AUTH_FAILED, `Provider auth failed for ${upper}`, {
      symbol: upper
    });
  }

  if (code === 'SYMBOL_UNSUPPORTED') {
    return new MarketProviderError(ErrorCodes.SYMBOL_UNSUPPORTED, `Symbol unsupported by provider for ${upper}`, {
      symbol: upper
    });
  }

  return new MarketProviderError(ErrorCodes.NO_LIVE_DATA, `No live quote available for ${upper}`, {
    symbol: upper,
    reason: code || 'LIVE_SOURCE_UNAVAILABLE'
  });
};

const normalizeSearchCategory = (symbol = '', description = '') => {
  const normalizedSymbol = String(symbol || '').toUpperCase();
  const normalizedDescription = String(description || '').toLowerCase();
  if (normalizedSymbol.endsWith('USDT') || normalizedSymbol.startsWith('BINANCE:')) return 'crypto';
  if (normalizedSymbol.includes('_') || normalizedSymbol.startsWith('OANDA:')) return 'fx';
  if (normalizedDescription.includes('etf')) return 'equity';
  if (normalizedDescription.includes('bond') || normalizedDescription.includes('treasury')) return 'bond';
  if (normalizedDescription.includes('future') || normalizedDescription.includes('commodity')) return 'commodity';
  return 'equity';
};

const scoreSearchResult = (query, item) => {
  const needle = String(query || '').trim().toLowerCase();
  const symbol = String(item?.symbol || '').trim().toLowerCase();
  const name = String(item?.name || '').trim().toLowerCase();

  let score = 0;
  if (symbol === needle) score += 140;
  else if (symbol.startsWith(needle)) score += 95;
  else if (symbol.includes(needle)) score += 60;

  if (name === needle) score += 100;
  else if (name.startsWith(needle)) score += 75;
  else if (name.includes(needle)) score += 45;

  if (symbol.includes('.')) score -= 2;
  if (symbol.includes(':')) score -= 5;
  return score;
};

const parsePercent = (value) => {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const clean = raw.endsWith('%') ? raw.slice(0, -1) : raw;
  const out = Number(clean);
  return Number.isFinite(out) ? out : null;
};

const resolveViaFinnhub = async (internal) => {
  const quoteSymbol = mapInternalToFinnhub(internal);
  if (!quoteSymbol) {
    throw new MarketProviderError(ErrorCodes.SYMBOL_UNSUPPORTED, `Cannot map symbol: ${internal}`, { symbol: internal });
  }
  const out = await finnhub.quote(quoteSymbol);
  const price = toFinite(out?.c);
  const previousClose = toFinite(out?.pc);
  const percentChange = toFinite(out?.dp);
  if (!Number.isFinite(price) || price <= 0) {
    throw new MarketProviderError(ErrorCodes.NO_LIVE_DATA, `No live quote available for ${internal}`, {
      symbol: internal,
      reason: 'INVALID_PRICE'
    });
  }

  return {
    quote: {
      c: price,
      pc: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : price,
      dp: Number.isFinite(percentChange) ? percentChange : null,
      h: toFinite(out?.h),
      l: toFinite(out?.l),
      o: toFinite(out?.o),
      t: toFinite(out?.t)
    },
    meta: {
      source: 'finnhub',
      asOf: new Date().toISOString(),
      symbol: internal,
      stale: false,
      fallbackLevel: 0
    }
  };
};

const resolveViaTwelveData = async (internal) => {
  if (typeof twelvedata.hasKey === 'function' && !twelvedata.hasKey()) {
    throw new MarketProviderError(ErrorCodes.KEY_MISSING, 'TWELVE_DATA_KEY not configured', { symbol: internal });
  }

  const symbol = mapInternalToTwelve(internal);
  if (!symbol) {
    throw new MarketProviderError(ErrorCodes.SYMBOL_UNSUPPORTED, `Cannot map symbol: ${internal}`, { symbol: internal });
  }

  const out = await twelvedata.quote(symbol);
  const price = toFinite(out?.close ?? out?.price);
  const previousClose = toFinite(out?.previous_close);
  const percentChange = parsePercent(out?.percent_change);

  if (!Number.isFinite(price) || price <= 0) {
    throw new MarketProviderError(ErrorCodes.NO_LIVE_DATA, `No live quote available for ${internal}`, {
      symbol: internal,
      reason: 'INVALID_PRICE'
    });
  }

  const asOf = out?.datetime ? new Date(out.datetime).toISOString() : new Date().toISOString();

  return {
    quote: {
      c: price,
      pc: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : price,
      dp: Number.isFinite(percentChange) ? percentChange : null,
      h: toFinite(out?.high),
      l: toFinite(out?.low),
      o: toFinite(out?.open),
      t: Math.floor(new Date(asOf).getTime() / 1000)
    },
    meta: {
      source: 'twelvedata',
      asOf,
      symbol: internal,
      stale: false,
      fallbackLevel: 1
    }
  };
};

const resolveMarketQuote = async (symbol) => {
  const internal = mapFinnhubToInternal(symbol);
  if (!internal) {
    throw new MarketProviderError(ErrorCodes.NO_LIVE_DATA, 'Empty symbol', { reason: 'SYMBOL_REQUIRED' });
  }

  let finnhubError = null;
  try {
    return await resolveViaFinnhub(internal);
  } catch (error) {
    finnhubError = error;
  }

  try {
    return await resolveViaTwelveData(internal);
  } catch (twelveError) {
    const normalized = normalizeProviderError(internal, finnhubError || twelveError);
    normalized.details = {
      ...(normalized.details || {}),
      attempts: [
        {
          provider: 'finnhub',
          code: String(finnhubError?.code || ''),
          status: Number(finnhubError?.status || 0) || null
        },
        {
          provider: 'twelvedata',
          code: String(twelveError?.code || ''),
          status: Number(twelveError?.status || 0) || null
        }
      ]
    };
    throw normalized;
  }
};

const toCandleResolution = (resolution = 'D') => {
  const raw = String(resolution || 'D').toUpperCase();
  if (['1', '5', '15', '30', '60', 'D', 'W', 'M'].includes(raw)) return raw;
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0) {
    if (num >= 60 && num % 60 === 0) return String(Math.min(60, num));
    return String(Math.min(30, num));
  }
  return 'D';
};

const normalizeCandles = (payload) => {
  const c = Array.isArray(payload?.c) ? payload.c : [];
  const h = Array.isArray(payload?.h) ? payload.h : [];
  const l = Array.isArray(payload?.l) ? payload.l : [];
  const v = Array.isArray(payload?.v) ? payload.v : [];
  const t = Array.isArray(payload?.t) ? payload.t : [];
  return {
    s: String(payload?.s || (c.length ? 'ok' : 'no_data')),
    c: c.map((x) => toFinite(x)).filter((x) => Number.isFinite(x)),
    h: h.map((x) => toFinite(x)).filter((x) => Number.isFinite(x)),
    l: l.map((x) => toFinite(x)).filter((x) => Number.isFinite(x)),
    v: v.map((x) => toFinite(x) ?? 0),
    t: t.map((x) => toFinite(x)).filter((x) => Number.isFinite(x))
  };
};

const toTwelveInterval = (resolution = 'D') => {
  const raw = toCandleResolution(resolution);
  if (raw === 'W') return '1week';
  if (raw === 'M') return '1month';
  if (raw === 'D') return '1day';
  if (raw === '60') return '1h';
  if (raw === '30') return '30min';
  if (raw === '15') return '15min';
  if (raw === '5') return '5min';
  if (raw === '1') return '1min';
  return '1day';
};

const normalizeTwelveCandles = (payload = {}) => {
  const rows = Array.isArray(payload?.values) ? payload.values : [];
  if (!rows.length) return { s: 'no_data', c: [], h: [], l: [], v: [], t: [] };

  const normalized = rows
    .map((row) => {
      const ts = Math.floor(new Date(String(row?.datetime || '')).getTime() / 1000);
      if (!Number.isFinite(ts) || ts <= 0) return null;
      const close = toFinite(row?.close);
      const high = toFinite(row?.high);
      const low = toFinite(row?.low);
      const volume = toFinite(row?.volume) ?? 0;
      if (![close, high, low].every((x) => Number.isFinite(x))) return null;
      return { ts, close, high, low, volume };
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);

  if (!normalized.length) return { s: 'no_data', c: [], h: [], l: [], v: [], t: [] };

  return {
    s: 'ok',
    c: normalized.map((x) => x.close),
    h: normalized.map((x) => x.high),
    l: normalized.map((x) => x.low),
    v: normalized.map((x) => x.volume),
    t: normalized.map((x) => x.ts)
  };
};

const resolveMarketCandles = async ({ symbol, resolution = 'D', from, to, outputsize = 90 }) => {
  const internal = mapFinnhubToInternal(symbol);
  if (!internal) throw new MarketProviderError(ErrorCodes.NO_LIVE_DATA, 'Empty symbol', { reason: 'SYMBOL_REQUIRED' });

  const nowSec = Math.floor(Date.now() / 1000);
  const toTs = Number.isFinite(Number(to)) ? Number(to) : nowSec;
  const fallbackRangeSec = Math.max(1, Number(outputsize || 90)) * 24 * 60 * 60;
  const fromTs = Number.isFinite(Number(from)) ? Number(from) : Math.max(0, toTs - fallbackRangeSec);

  const candleResolution = toCandleResolution(resolution);
  try {
    if (internal.endsWith('USDT')) {
      return normalizeCandles(await finnhub.cryptoCandles(internal, candleResolution, fromTs, toTs));
    }
    if (internal.includes('_')) {
      const [base, quote] = internal.split('_');
      return normalizeCandles(await finnhub.forexCandles(base, quote, candleResolution, fromTs, toTs));
    }
    return normalizeCandles(await finnhub.candles(internal, candleResolution, fromTs, toTs));
  } catch (error) {
    try {
      if (typeof twelvedata.hasKey === 'function' && !twelvedata.hasKey()) {
        throw normalizeProviderError(internal, error);
      }
      const twelveSymbol = mapInternalToTwelve(internal);
      const interval = toTwelveInterval(candleResolution);
      const series = await twelvedata.timeSeries(twelveSymbol, interval, Math.max(30, Number(outputsize || 90)));
      const normalized = normalizeTwelveCandles(series);
      if (normalized.s !== 'ok') {
        throw normalizeProviderError(internal, error);
      }
      return normalized;
    } catch (fallbackError) {
      throw normalizeProviderError(internal, error || fallbackError);
    }
  }
};

const resolveMarketSearch = async (query) => {
  const q = String(query || '').trim();
  if (!q) return [];

  let out;
  try {
    out = await finnhub.symbolSearch(q);
  } catch {
    out = { result: [] };
  }

  const rows = Array.isArray(out?.result) ? out.result : [];
  const mappedFinnhub = rows
    .map((item) => {
      const providerSymbol = String(item?.symbol || '').trim().toUpperCase();
      const internalSymbol = mapFinnhubToInternal(providerSymbol);
      const name = String(item?.description || item?.displaySymbol || '').trim();
      if (!internalSymbol || !name) return null;
      return {
        symbol: internalSymbol,
        name,
        category: normalizeSearchCategory(providerSymbol, name),
        source: 'finnhub',
        providerSymbol
      };
    })
    .filter(Boolean);

  if (!mappedFinnhub.length && typeof twelvedata.hasKey === 'function' && twelvedata.hasKey()) {
    try {
      const twelve = await twelvedata.symbolSearch(q, 20);
      const rows = Array.isArray(twelve?.data) ? twelve.data : [];
      const mappedTwelve = rows
        .map((item) => {
          const rawSymbol = String(item?.symbol || '').trim().toUpperCase();
          const name = String(item?.instrument_name || item?.symbol || '').trim();
          if (!rawSymbol || !name) return null;
          const internalSymbol = mapFinnhubToInternal(rawSymbol.replace('/', '_'));
          if (!internalSymbol) return null;
          return {
            symbol: internalSymbol,
            name,
            category: normalizeSearchCategory(rawSymbol, name),
            source: 'twelvedata',
            providerSymbol: rawSymbol
          };
        })
        .filter(Boolean);
      if (mappedTwelve.length) {
        return mappedTwelve
          .sort((a, b) => scoreSearchResult(q, b) - scoreSearchResult(q, a))
          .slice(0, 20);
      }
    } catch {
      return [];
    }
  }

  return mappedFinnhub
    .sort((a, b) => scoreSearchResult(q, b) - scoreSearchResult(q, a))
    .slice(0, 20);
};

module.exports = {
  resolveMarketQuote,
  resolveMarketSearch,
  resolveMarketCandles,
  mapInternalToFinnhub,
  mapFinnhubToInternal,
  ErrorCodes,
  MarketProviderError
};
