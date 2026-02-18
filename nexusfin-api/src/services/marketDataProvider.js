const av = require('./alphavantage');
const finnhub = require('./finnhub');

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

const resolveMarketQuote = async (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;

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
      meta: buildMeta('finnhub', 0)
    };
  } catch (error) {
    if (!isFinnhubUnavailable(error)) throw error;

    const alpha = await resolveAlphaFallbackQuote(upper);
    if (alpha) return { quote: alpha, meta: buildMeta('alphavantage', 1) };

    const yahoo = await resolveYahooFallbackQuote(upper);
    if (yahoo) return { quote: yahoo, meta: buildMeta('yahoo', 2) };

    return {
      quote: syntheticQuote(upper, error?.retryAfterMs),
      meta: buildMeta('synthetic', 3)
    };
  }
};

module.exports = {
  resolveMarketQuote,
  syntheticQuote,
  isFinnhubUnavailable
};
