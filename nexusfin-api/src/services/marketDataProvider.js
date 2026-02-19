const twelvedata = require('./twelvedata');
const { ErrorCodes, TwelveDataError } = twelvedata;

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const METAL_CODES = new Set(['XAU', 'XAG', 'XPT', 'XPD']);
const FIAT_CODES = new Set(['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'CNY', 'HKD', 'SEK', 'NOK', 'MXN', 'BRL', 'ARS']);

const toTwelveDataSymbol = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;

  if (upper.endsWith('USDT')) {
    const base = upper.slice(0, -4);
    return base ? `${base}/USD` : null;
  }

  if (upper.includes('_')) {
    const [base, quote] = upper.split('_');
    if (!base || !quote) return null;
    return `${base}/${quote}`;
  }

  return upper;
};

const fromTwelveDataSymbol = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  if (!upper.includes('/')) return upper;

  const [base, quote] = upper.split('/');
  if (!base || !quote) return null;

  const isForexOrMetal = FIAT_CODES.has(base) || FIAT_CODES.has(quote) || METAL_CODES.has(base);
  if (isForexOrMetal) return `${base}_${quote}`;
  return quote === 'USD' ? `${base}USDT` : `${base}_${quote}`;
};

const mapCategory = ({ symbol, type = '' }) => {
  const normalizedSymbol = String(symbol || '').toUpperCase();
  const normalizedType = String(type || '').toLowerCase();

  if (normalizedSymbol.endsWith('USDT') || normalizedType.includes('crypto')) return 'crypto';
  if (normalizedSymbol.includes('_') || normalizedType.includes('forex') || normalizedType.includes('currency')) {
    return normalizedSymbol.startsWith('XAU_') || normalizedSymbol.startsWith('XAG_') || normalizedType.includes('metal')
      ? 'metal'
      : 'fx';
  }
  if (normalizedType.includes('metal')) return 'metal';
  if (normalizedType.includes('commodity') || normalizedType.includes('future')) return 'commodity';
  if (normalizedType.includes('bond') || normalizedType.includes('treasury')) return 'bond';
  return 'equity';
};

const scoreSearchResult = (query, item) => {
  const needle = String(query || '').trim().toLowerCase();
  const symbol = String(item?.symbol || '').trim().toLowerCase();
  const name = String(item?.name || '').trim().toLowerCase();

  let score = 0;
  if (symbol === needle) score += 140;
  else if (symbol.startsWith(needle)) score += 95;
  else if (symbol.includes(needle)) score += 65;

  if (name === needle) score += 100;
  else if (name.startsWith(needle)) score += 75;
  else if (name.includes(needle)) score += 50;

  const type = String(item?.type || '').toLowerCase();
  if (type.includes('stock') || type.includes('adr') || type.includes('etf') || type.includes('index')) score += 15;
  if (type.includes('warrant') || type.includes('right')) score -= 25;
  if (symbol.includes(':')) score -= 8;

  return score;
};

const normalizeNoLiveError = (symbol, error) => {
  if (error instanceof TwelveDataError) return error;
  const upper = String(symbol || '').toUpperCase();
  return new TwelveDataError(
    ErrorCodes.NO_LIVE_DATA,
    `No live quote available for ${upper}`,
    { symbol: upper, reason: error?.code || 'LIVE_SOURCE_UNAVAILABLE' }
  );
};

const resolveMarketQuote = async (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) {
    throw new TwelveDataError(ErrorCodes.NO_LIVE_DATA, 'Empty symbol', { reason: 'SYMBOL_REQUIRED' });
  }

  const tdSymbol = toTwelveDataSymbol(upper);
  if (!tdSymbol) {
    throw new TwelveDataError(ErrorCodes.SYMBOL_UNSUPPORTED, `Cannot map symbol: ${upper}`, { reason: 'INVALID_SYMBOL' });
  }

  let out;
  try {
    out = await twelvedata.quote(tdSymbol);
  } catch (error) {
    throw normalizeNoLiveError(upper, error);
  }

  const price = toFinite(out?.close ?? out?.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new TwelveDataError(ErrorCodes.NO_LIVE_DATA, `No live quote available for ${upper}`, {
      symbol: upper,
      reason: 'INVALID_PRICE'
    });
  }

  const previousClose = toFinite(out?.previous_close);
  const percentChange = toFinite(out?.percent_change ?? out?.change_percent ?? out?.dp);

  return {
    quote: {
      c: price,
      pc: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : price,
      dp: Number.isFinite(percentChange) ? percentChange : null
    },
    meta: {
      source: 'twelvedata',
      asOf: new Date().toISOString(),
      symbol: upper,
      stale: false,
      fallbackLevel: 0
    }
  };
};

const mapResolutionToInterval = (resolution = 'D') => {
  const raw = String(resolution || 'D').toUpperCase();
  if (raw === 'D') return '1day';
  if (raw === 'W') return '1week';
  if (raw === 'M') return '1month';
  const minutes = Number(raw);
  if (Number.isFinite(minutes) && minutes > 0) {
    if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
    return `${minutes}min`;
  }
  return '1day';
};

const resolveMarketCandles = async ({ symbol, resolution = 'D', outputsize = 120 }) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) {
    throw new TwelveDataError(ErrorCodes.NO_LIVE_DATA, 'Empty symbol', { reason: 'SYMBOL_REQUIRED' });
  }

  const tdSymbol = toTwelveDataSymbol(upper);
  if (!tdSymbol) {
    throw new TwelveDataError(ErrorCodes.SYMBOL_UNSUPPORTED, `Cannot map symbol: ${upper}`, { reason: 'INVALID_SYMBOL' });
  }

  const out = await twelvedata.timeSeries(tdSymbol, mapResolutionToInterval(resolution), outputsize);
  const values = Array.isArray(out?.values) ? out.values.slice().reverse() : [];

  const c = [];
  const h = [];
  const l = [];
  const v = [];

  for (const row of values) {
    const close = toFinite(row?.close);
    if (!Number.isFinite(close)) continue;
    c.push(close);
    h.push(toFinite(row?.high) ?? close);
    l.push(toFinite(row?.low) ?? close);
    v.push(toFinite(row?.volume) ?? 0);
  }

  return {
    s: c.length ? 'ok' : 'no_data',
    c,
    h,
    l,
    v,
    t: values.map((row) => row?.datetime).filter(Boolean)
  };
};

const resolveMarketSearch = async (query) => {
  const q = String(query || '').trim();
  if (!q || !twelvedata.hasKey()) return [];

  const out = await twelvedata.symbolSearch(q, 40);
  const rows = Array.isArray(out?.data) ? out.data : [];

  return rows
    .map((item) => {
      const tdSymbol = String(item?.symbol || '').trim().toUpperCase();
      const symbol = fromTwelveDataSymbol(tdSymbol);
      const name = String(item?.instrument_name || item?.name || '').trim();
      const type = String(item?.instrument_type || item?.type || '').trim();
      return { symbol, name, type };
    })
    .filter((item) => item.symbol && item.name)
    .sort((a, b) => scoreSearchResult(q, b) - scoreSearchResult(q, a))
    .slice(0, 20)
    .map((item) => ({
      symbol: item.symbol,
      name: item.name,
      category: mapCategory(item),
      source: 'twelvedata',
      type: item.type
    }));
};

module.exports = {
  resolveMarketQuote,
  resolveMarketSearch,
  resolveMarketCandles,
  toTwelveDataSymbol,
  fromTwelveDataSymbol,
  mapResolutionToInterval,
  ErrorCodes,
  TwelveDataError
};
