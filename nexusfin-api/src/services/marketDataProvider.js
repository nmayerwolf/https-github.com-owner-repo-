const twelvedata = require('./twelvedata');

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const toTwelveDataSymbol = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  if (upper.includes('_')) {
    const [base, quote] = upper.split('_');
    if (!base || !quote) return null;
    return `${base}/${quote}`;
  }
  if (upper.endsWith('USDT')) {
    const base = upper.replace(/USDT$/, '');
    return base ? `${base}/USD` : null;
  }
  return upper;
};

const canonicalizeSymbol = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  if (upper.includes('/')) {
    const [base, quote] = upper.split('/');
    if (!base || !quote) return upper;
    return `${base}_${quote}`;
  }
  return upper;
};

const normalizeSearchCategory = (symbol, type = '') => {
  const normalizedSymbol = String(symbol || '').toUpperCase();
  const normalizedType = String(type || '').toLowerCase();
  if (normalizedSymbol.endsWith('USDT') || normalizedType.includes('crypto')) return 'crypto';
  if (normalizedSymbol.includes('_') || normalizedType.includes('forex') || normalizedType.includes('currency')) return 'fx';
  if (normalizedType.includes('etf')) return 'etf';
  if (normalizedType.includes('commodity') || normalizedType.includes('futures')) return 'commodity';
  if (normalizedType.includes('metal')) return 'metal';
  if (normalizedType.includes('bond') || normalizedType.includes('treasury')) return 'bond';
  return 'equity';
};

const scoreSearchResult = (query, item) => {
  const needle = String(query || '').trim().toLowerCase();
  const symbol = String(item?.symbol || '').trim().toLowerCase();
  const name = String(item?.name || '').trim().toLowerCase();

  let score = 0;
  if (symbol === needle) score += 120;
  else if (symbol.startsWith(needle)) score += 80;
  else if (symbol.includes(needle)) score += 55;

  if (name === needle) score += 95;
  else if (name.startsWith(needle)) score += 70;
  else if (name.includes(needle)) score += 45;

  const type = String(item?.type || '').toLowerCase();
  if (type.includes('stock') || type.includes('adr') || type.includes('etf') || type.includes('index')) score += 20;
  if (type.includes('right') || type.includes('warrant') || type.includes('preferred')) score -= 20;
  if (symbol.includes(':')) score -= 8;
  if (symbol.length > 12) score -= 5;

  return score;
};

const makeLiveUnavailableError = (reason, symbol = '') => {
  const error = new Error(
    reason === 'TWELVE_DATA_KEY_MISSING'
      ? 'Missing TWELVE_DATA_KEY'
      : `No live quote available for ${symbol}`
  );
  error.code = 'NO_LIVE_DATA';
  error.status = 503;
  error.reason = reason;
  error.symbol = symbol;
  return error;
};

const resolveMarketQuote = async (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) throw makeLiveUnavailableError('SYMBOL_REQUIRED', upper);

  if (!twelvedata.hasKey()) throw makeLiveUnavailableError('TWELVE_DATA_KEY_MISSING', upper);

  const quoteSymbol = toTwelveDataSymbol(upper);
  if (!quoteSymbol) throw makeLiveUnavailableError('INVALID_SYMBOL', upper);

  let out;
  try {
    out = await twelvedata.quote(quoteSymbol);
  } catch {
    throw makeLiveUnavailableError('LIVE_SOURCE_UNAVAILABLE', upper);
  }

  const price = toFinite(out?.close ?? out?.price);
  if (!Number.isFinite(price) || price <= 0) throw makeLiveUnavailableError('LIVE_SOURCE_UNAVAILABLE', upper);

  const previousClose = toFinite(out?.previous_close);
  const pct = toFinite(out?.percent_change ?? out?.change_percent);

  return {
    quote: {
      c: price,
      pc: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : price,
      dp: Number.isFinite(pct) ? pct : null
    },
    meta: {
      source: 'twelvedata',
      asOf: new Date().toISOString(),
      stale: false,
      fallbackLevel: 0
    }
  };
};

const resolveMarketSearch = async (query) => {
  const q = String(query || '').trim();
  if (!q || !twelvedata.hasKey()) return [];

  const out = await twelvedata.symbolSearch(q, 20);
  const rows = Array.isArray(out?.data) ? out.data : [];

  return rows
    .map((item) => ({
      symbol: canonicalizeSymbol(item?.symbol),
      name: String(item?.instrument_name || '').trim(),
      type: String(item?.instrument_type || item?.type || '').trim()
    }))
    .filter((item) => item.symbol && item.name)
    .sort((a, b) => scoreSearchResult(q, b) - scoreSearchResult(q, a))
    .slice(0, 20)
    .map((item) => {
      const category = normalizeSearchCategory(item.symbol, item.type);
      const sourceSuffix = category === 'crypto' ? 'crypto' : category === 'fx' ? 'fx' : 'stock';
      return {
        symbol: item.symbol,
        name: item.name,
        category,
        source: `twelvedata_${sourceSuffix}`,
        type: item.type
      };
    });
};

module.exports = {
  resolveMarketQuote,
  resolveMarketSearch,
  syntheticQuote: () => null,
  isFinnhubUnavailable: () => false
};
