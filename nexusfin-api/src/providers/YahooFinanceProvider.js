/**
 * YahooFinanceProvider — Drop-in fallback/complement to FinnhubProvider.
 *
 * Uses `yahoo-finance2` (npm i yahoo-finance2).
 * Covers: quotes, historical bars, fundamentals (PE, EPS, market cap),
 *         news (via search), and quoteSummary for enrichment.
 *
 * INSTALL:
 *   npm install yahoo-finance2
 *
 * USAGE:
 *   const { createYahooProvider } = require('./YahooFinanceProvider');
 *   const yahoo = createYahooProvider({ logger: console });
 *
 *   // Single quote (same shape as finnhub.quote)
 *   const q = await yahoo.quote('AAPL');
 *   // => { c: 192.53, dp: 1.24, d: 2.36, h: 193.10, l: 190.80, o: 191.20, pc: 190.17, t: 1700000000 }
 *
 *   // Historical bars (for market_daily_bars ingestion)
 *   const bars = await yahoo.historicalBars('AAPL', { period: '6mo', interval: '1d' });
 *   // => [{ date: '2025-01-02', open, high, low, close, volume }, ...]
 *
 *   // Fundamentals (PE, EPS, market cap, forward PE)
 *   const fund = await yahoo.fundamentals('AAPL');
 *   // => { pe: 31.2, forwardPe: 28.4, eps: 6.14, marketCap: 3020000000000, sector: 'Technology', industry: '...' }
 *
 *   // General news (returns array of { headline, source, url, ts })
 *   const news = await yahoo.generalNews('market', 20);
 */

const SYMBOL_MAP = {
  // Map Finnhub-style symbols to Yahoo symbols
  'BINANCE:BTCUSDT': 'BTC-USD',
  'BINANCE:ETHUSDT': 'ETH-USD',
  BTCUSDT: 'BTC-USD',
  ETHUSDT: 'ETH-USD',
  'OANDA:EUR_USD': 'EURUSD=X',
  'OANDA:GBP_USD': 'GBPUSD=X',
  'OANDA:USD_JPY': 'USDJPY=X',
  EUR_USD: 'EURUSD=X',
  GBP_USD: 'GBPUSD=X',
  USD_JPY: 'USDJPY=X',
  VIXM: '^VIX', // VIX index (your macro uses VIXM as proxy)
};

const toYahooSymbol = (symbol) => {
  const upper = String(symbol || '').toUpperCase().trim();
  return SYMBOL_MAP[upper] || SYMBOL_MAP[symbol] || upper;
};

const toIsoDate = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const createYahooProvider = ({ logger = console } = {}) => {
  // Lazy-load yahoo-finance2 (it's ESM-first, need dynamic import for CJS)
  let _yf = null;
  const getYF = async () => {
    if (_yf) return _yf;
    try {
      // yahoo-finance2 v3+ uses default export
      const mod = await import('yahoo-finance2');
      const YahooFinance = mod.default || mod;
      // v3: must instantiate
      if (typeof YahooFinance === 'function') {
        _yf = new YahooFinance();
      } else {
        _yf = YahooFinance;
      }
      return _yf;
    } catch (err) {
      logger.error?.('[YahooProvider] Failed to load yahoo-finance2:', err.message);
      throw new Error('YAHOO_FINANCE_NOT_INSTALLED');
    }
  };

  /**
   * quote(symbol) — Returns object matching Finnhub quote shape:
   *   { c: currentPrice, dp: changePercent, d: change, h: high, l: low, o: open, pc: prevClose, t: timestamp }
   */
  const quote = async (symbol) => {
    const yf = await getYF();
    const yahooSym = toYahooSymbol(symbol);

    try {
      const result = await yf.quote(yahooSym);
      if (!result || !result.regularMarketPrice) return null;

      return {
        c: result.regularMarketPrice,
        dp: result.regularMarketChangePercent ?? null,
        d: result.regularMarketChange ?? null,
        h: result.regularMarketDayHigh ?? null,
        l: result.regularMarketDayLow ?? null,
        o: result.regularMarketOpen ?? null,
        pc: result.regularMarketPreviousClose ?? null,
        t: result.regularMarketTime
          ? Math.floor(new Date(result.regularMarketTime).getTime() / 1000)
          : null,
      };
    } catch (err) {
      logger.warn?.(`[YahooProvider] quote(${yahooSym}) failed:`, err.message);
      return null;
    }
  };

  /**
   * quoteBatch(symbols) — Fetch multiple quotes in one call.
   * Returns Map<originalSymbol, quoteObject>
   */
  const quoteBatch = async (symbols = []) => {
    const yf = await getYF();
    const results = new Map();

    // yahoo-finance2 doesn't have a native batch, but we can parallelize
    const tasks = symbols.map(async (sym) => {
      try {
        const q = await quote(sym);
        if (q) results.set(sym, q);
      } catch {
        // skip failures silently
      }
    });

    await Promise.allSettled(tasks);
    return results;
  };

  /**
   * historicalBars(symbol, opts) — Get OHLCV daily bars.
   * opts: { period?: '3mo'|'6mo'|'1y'|'2y', startDate?: string, endDate?: string, interval?: '1d'|'1wk' }
   * Returns: [{ date, open, high, low, close, volume }]
   */
  const historicalBars = async (symbol, opts = {}) => {
    const yf = await getYF();
    const yahooSym = toYahooSymbol(symbol);
    const interval = opts.interval || '1d';

    try {
      let queryOpts;

      if (opts.startDate) {
        queryOpts = {
          period1: opts.startDate,
          period2: opts.endDate || new Date().toISOString().slice(0, 10),
          interval,
        };
      } else {
        // Use chart with period
        const period = opts.period || '6mo';
        const now = new Date();
        const periodMap = {
          '1mo': 30,
          '3mo': 90,
          '6mo': 180,
          '1y': 365,
          '2y': 730,
        };
        const days = periodMap[period] || 180;
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        queryOpts = {
          period1: start.toISOString().slice(0, 10),
          period2: now.toISOString().slice(0, 10),
          interval,
        };
      }

      const result = await yf.chart(yahooSym, queryOpts);
      const quotes = result?.quotes || [];

      return quotes
        .filter((q) => q.close != null)
        .map((q) => ({
          date: toIsoDate(q.date),
          open: q.open ?? null,
          high: q.high ?? null,
          low: q.low ?? null,
          close: q.close,
          volume: q.volume ?? 0,
        }));
    } catch (err) {
      logger.warn?.(`[YahooProvider] historicalBars(${yahooSym}) failed:`, err.message);
      return [];
    }
  };

  /**
   * fundamentals(symbol) — Get key fundamentals via quoteSummary.
   * Returns: { pe, forwardPe, eps, marketCap, sector, industry, dividendYield, beta, ... }
   */
  const fundamentals = async (symbol) => {
    const yf = await getYF();
    const yahooSym = toYahooSymbol(symbol);

    try {
      const result = await yf.quoteSummary(yahooSym, {
        modules: ['summaryDetail', 'defaultKeyStatistics', 'assetProfile', 'financialData'],
      });

      const summary = result?.summaryDetail || {};
      const keyStats = result?.defaultKeyStatistics || {};
      const profile = result?.assetProfile || {};
      const financial = result?.financialData || {};

      return {
        pe: summary.trailingPE ?? keyStats.trailingPE ?? null,
        forwardPe: summary.forwardPE ?? keyStats.forwardPE ?? null,
        eps: keyStats.trailingEps ?? null,
        marketCap: summary.marketCap ?? null,
        sector: profile.sector || null,
        industry: profile.industry || null,
        dividendYield: summary.dividendYield ?? null,
        beta: summary.beta ?? null,
        priceToBook: keyStats.priceToBook ?? null,
        debtToEquity: financial.debtToEquity ?? null,
        returnOnEquity: financial.returnOnEquity ?? null,
        revenueGrowth: financial.revenueGrowth ?? null,
        earningsGrowth: financial.earningsGrowth ?? null,
        targetMeanPrice: financial.targetMeanPrice ?? null,
        recommendationMean: financial.recommendationMean ?? null,
        recommendationKey: financial.recommendationKey ?? null,
      };
    } catch (err) {
      logger.warn?.(`[YahooProvider] fundamentals(${yahooSym}) failed:`, err.message);
      return null;
    }
  };

  /**
   * generalNews(query, count) — Search for news.
   * Returns array of { headline, source, url, ts, tickers }
   */
  const generalNews = async (queryStr = 'market', count = 20) => {
    const yf = await getYF();

    try {
      const result = await yf.search(queryStr, { newsCount: count, quotesCount: 0 });
      const news = result?.news || [];

      return news.map((item) => ({
        headline: item.title || '',
        source: item.publisher || '',
        url: item.link || '',
        ts: item.providerPublishTime
          ? new Date(item.providerPublishTime * 1000).toISOString()
          : null,
        tickers: Array.isArray(item.relatedTickers) ? item.relatedTickers : [],
      }));
    } catch (err) {
      logger.warn?.(`[YahooProvider] generalNews failed:`, err.message);
      return [];
    }
  };

  /**
   * dailyGainersLosers() — Get top movers.
   * Returns { gainers: [...], losers: [...] }
   */
  const dailyGainersLosers = async () => {
    const yf = await getYF();

    try {
      const [gainersResult, losersResult] = await Promise.allSettled([
        yf.dailyGainers?.() || Promise.resolve(null),
        yf.dailyLosers?.() || Promise.resolve(null),
      ]);

      const mapQuotes = (result) =>
        (result?.status === 'fulfilled' && result.value?.quotes
          ? result.value.quotes
          : []
        )
          .slice(0, 10)
          .map((q) => ({
            symbol: q.symbol,
            name: q.shortName || q.longName || q.symbol,
            price: q.regularMarketPrice,
            changePct: q.regularMarketChangePercent,
          }));

      return {
        gainers: mapQuotes(gainersResult),
        losers: mapQuotes(losersResult),
      };
    } catch (err) {
      logger.warn?.('[YahooProvider] dailyGainersLosers failed:', err.message);
      return { gainers: [], losers: [] };
    }
  };

  return {
    name: 'yahoo',
    quote,
    quoteBatch,
    historicalBars,
    fundamentals,
    generalNews,
    dailyGainersLosers,
  };
};

module.exports = { createYahooProvider, toYahooSymbol, SYMBOL_MAP };
