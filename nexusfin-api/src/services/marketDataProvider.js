const av = require('./alphavantage');
const finnhub = require('./finnhub');
const twelvedata = require('./twelvedata');

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const isFinnhubUnavailable = (error) =>
  error?.code === 'FINNHUB_ENDPOINT_FORBIDDEN' ||
  error?.code === 'FINNHUB_RATE_LIMIT' ||
  error?.status === 403 ||
  error?.status === 429;

const toFinnhubSymbol = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  if (upper.endsWith('USDT')) return `BINANCE:${upper}`;
  if (upper.includes('_')) return `OANDA:${upper}`;
  return upper;
};

const toYahooSymbol = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  if (upper.includes('_')) {
    const [fromCurrency, toCurrency] = upper.split('_');
    if (!fromCurrency || !toCurrency) return null;
    return `${fromCurrency}${toCurrency}=X`;
  }
  if (upper.endsWith('USDT')) {
    const base = upper.replace(/USDT$/, '');
    return base ? `${base}-USD` : null;
  }
  return upper;
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
    d: null,
    dp: null,
    h: c,
    l: c,
    o: c,
    t: Math.floor(Date.now() / 1000),
    fallback: true,
    retryAfterMs: Number(retryAfterMs) || 0
  };
};

const buildMeta = (source, fallbackLevel) => ({
  source,
  asOf: new Date().toISOString(),
  stale: source === 'synthetic',
  fallbackLevel
});

const normalizeSearchCategory = (symbol, type = '') => {
  const normalizedSymbol = String(symbol || '').toUpperCase();
  const normalizedType = String(type || '').toLowerCase();
  if (normalizedSymbol.endsWith('USDT') || normalizedType.includes('crypto')) return 'crypto';
  if (normalizedSymbol.includes('_') || normalizedType.includes('forex') || normalizedType.includes('currency')) return 'fx';
  if (normalizedType.includes('etf')) return 'etf';
  if (normalizedType.includes('commodity') || normalizedType.includes('futures')) return 'commodity';
  if (normalizedType.includes('index')) return 'equity';
  return 'equity';
};

const resolveTwelveDataQuote = async (symbol) => {
  if (!twelvedata.hasKey()) return null;
  const quoteSymbol = toTwelveDataSymbol(symbol);
  if (!quoteSymbol) return null;
  try {
    const out = await twelvedata.quote(quoteSymbol);
    const price = toFinite(out?.price);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { c: price, pc: price, dp: 0, fallback: true };
  } catch {
    return null;
  }
};

const resolveAlphaFallbackQuote = async (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  try {
    if (upper.includes('_')) {
      const [fromCurrency, toCurrency] = upper.split('_');
      if (!fromCurrency || !toCurrency) return null;
      const raw = await av.fxRate(fromCurrency, toCurrency);
      const node = raw?.['Realtime Currency Exchange Rate'] || {};
      const price = toFinite(node?.['5. Exchange Rate']);
      if (!Number.isFinite(price) || price <= 0) return null;
      return { c: price, pc: price, dp: 0, fallback: true };
    }

    if (upper.endsWith('USDT')) {
      const base = upper.replace(/USDT$/, '');
      if (!base) return null;
      const raw = await av.digitalDaily(base, 'USD');
      const series = raw?.['Time Series (Digital Currency Daily)'];
      const rows = series && typeof series === 'object' ? Object.values(series) : [];
      const current = toFinite(rows?.[0]?.['4a. close (USD)']);
      const previous = toFinite(rows?.[1]?.['4a. close (USD)']);
      if (!Number.isFinite(current) || current <= 0) return null;
      const pc = Number.isFinite(previous) && previous > 0 ? previous : current;
      const dp = pc > 0 ? ((current - pc) / pc) * 100 : 0;
      return { c: current, pc, dp, fallback: true };
    }

    const raw = await av.globalQuote(upper);
    const node = raw?.['Global Quote'] || {};
    const price = toFinite(node?.['05. price']);
    const previousClose = toFinite(node?.['08. previous close']);
    const changePercentRaw = String(node?.['10. change percent'] || '').replace('%', '');
    const parsedChange = toFinite(changePercentRaw);
    if (!Number.isFinite(price) || price <= 0) return null;
    const pc = Number.isFinite(previousClose) && previousClose > 0 ? previousClose : price;
    const dp = Number.isFinite(parsedChange) ? parsedChange : pc > 0 ? ((price - pc) / pc) * 100 : 0;
    return { c: price, pc, dp, fallback: true };
  } catch {
    return null;
  }
};

const resolveYahooFallbackQuote = async (symbol) => {
  const yahooSymbol = toYahooSymbol(symbol);
  if (!yahooSymbol) return null;
  try {
    const qs = new URLSearchParams({ symbols: yahooSymbol });
    const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?${qs.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.quoteResponse?.result?.[0];
    if (!item) return null;
    const price = toFinite(item.regularMarketPrice);
    const previousClose = toFinite(item.regularMarketPreviousClose);
    const changePercent = toFinite(item.regularMarketChangePercent);
    if (!Number.isFinite(price) || price <= 0) return null;
    const pc = Number.isFinite(previousClose) && previousClose > 0 ? previousClose : price;
    const dp = Number.isFinite(changePercent) ? changePercent : pc > 0 ? ((price - pc) / pc) * 100 : 0;
    return { c: price, pc, dp, fallback: true };
  } catch {
    return null;
  }
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

const resolveMarketSearch = async (query) => {
  const q = String(query || '').trim();
  if (!q) return [];

  if (twelvedata.hasKey()) {
    try {
      const out = await twelvedata.symbolSearch(q, 20);
      const rows = Array.isArray(out?.data) ? out.data : [];
      const mapped = rows
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
      if (mapped.length) return mapped;
    } catch {
      // Fallback to Finnhub below.
    }
  }

  try {
    const out = await finnhub.symbolSearch(q);
    const rows = Array.isArray(out?.result) ? out.result : [];
    return rows
      .filter((item) => String(item?.symbol || '').trim() && String(item?.description || '').trim())
      .sort((a, b) => scoreSearchResult(q, { symbol: b.symbol, name: b.description, type: b.type }) - scoreSearchResult(q, { symbol: a.symbol, name: a.description, type: a.type }))
      .slice(0, 20)
      .map((item) => {
        const symbol = String(item.symbol || '').trim().toUpperCase();
        const name = String(item.description || '').trim();
        const type = String(item.type || '').trim();
        const category = normalizeSearchCategory(symbol, type);
        const sourceSuffix = category === 'crypto' ? 'crypto' : category === 'fx' ? 'fx' : 'stock';
        return {
          symbol,
          name,
          category,
          source: `finnhub_${sourceSuffix}`,
          type
        };
      });
  } catch {
    return [];
  }
};

const resolveMarketQuote = async (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;

  const twelve = await resolveTwelveDataQuote(upper);
  if (twelve) return { quote: twelve, meta: buildMeta('twelvedata', 0) };

  try {
    const quoteSymbol = toFinnhubSymbol(upper);
    const quote = await finnhub.quote(quoteSymbol);
    const price = toFinite(quote?.c);
    if (!Number.isFinite(price) || price <= 0) throw new Error('invalid quote');
    const previousClose = toFinite(quote?.pc);
    return {
      quote: {
        c: price,
        pc: previousClose ?? price,
        dp: toFinite(quote?.dp) ?? 0
      },
      meta: buildMeta('finnhub', 1)
    };
  } catch (error) {
    const shouldFallback = isFinnhubUnavailable(error) || String(error?.message || '').toLowerCase().includes('invalid quote');
    if (!shouldFallback) throw error;

    const alpha = await resolveAlphaFallbackQuote(upper);
    if (alpha) return { quote: alpha, meta: buildMeta('alphavantage', 2) };

    const yahoo = await resolveYahooFallbackQuote(upper);
    if (yahoo) return { quote: yahoo, meta: buildMeta('yahoo', 3) };

    return {
      quote: syntheticQuote(upper, error?.retryAfterMs),
      meta: buildMeta('synthetic', 4)
    };
  }
};

module.exports = {
  resolveMarketQuote,
  resolveMarketSearch,
  syntheticQuote,
  isFinnhubUnavailable
};
