class MarketDataProvider {
  async getDailyBars(_symbols, _from, _to) {
    throw new Error('getDailyBars must be implemented by provider');
  }

  async getFundamentals(_symbols) {
    throw new Error('getFundamentals must be implemented by provider');
  }

  async getEarningsCalendar(_from, _to) {
    return [];
  }

  async getNews(_from, _to, _queryTags = []) {
    throw new Error('getNews must be implemented by provider');
  }
}

const createMarketDataProvider = ({ finnhub = null, yahoo = null, logger = console } = {}) => {
  const stats = {
    finnhubHits: 0,
    finnhubMisses: 0,
    yahooHits: 0,
    yahooMisses: 0,
    totalCalls: 0
  };

  const quote = async (symbol) => {
    stats.totalCalls += 1;

    if (finnhub) {
      try {
        const result = await finnhub.quote(symbol);
        if (result && (result.c || result.c === 0)) {
          stats.finnhubHits += 1;
          return result;
        }
      } catch (err) {
        logger.debug?.(`[MarketData] Finnhub quote(${symbol}) failed: ${err.message}`);
      }
      stats.finnhubMisses += 1;
    }

    if (yahoo) {
      try {
        const result = await yahoo.quote(symbol);
        if (result) {
          stats.yahooHits += 1;
          return result;
        }
      } catch (err) {
        logger.debug?.(`[MarketData] Yahoo quote(${symbol}) failed: ${err.message}`);
      }
      stats.yahooMisses += 1;
    }

    return { c: null, dp: null };
  };

  const quoteBatch = async (symbols = []) => {
    const results = new Map();
    const tasks = symbols.map(async (sym) => {
      const q = await quote(sym);
      if (q && q.c != null) results.set(sym, q);
    });
    await Promise.allSettled(tasks);
    return results;
  };

  const historicalBars = async (symbol, opts = {}) => {
    if (yahoo) {
      try {
        const bars = await yahoo.historicalBars(symbol, opts);
        if (bars && bars.length > 0) return bars;
      } catch (err) {
        logger.debug?.(`[MarketData] Yahoo historicalBars(${symbol}) failed: ${err.message}`);
      }
    }

    if (finnhub?.candles) {
      try {
        const now = Math.floor(Date.now() / 1000);
        const from = now - (opts.days || 180) * 24 * 60 * 60;
        const result = await finnhub.candles(symbol, 'D', from, now);
        if (result?.s === 'ok' && Array.isArray(result.c)) {
          return result.t.map((t, i) => ({
            date: new Date(t * 1000).toISOString().slice(0, 10),
            open: result.o[i],
            high: result.h[i],
            low: result.l[i],
            close: result.c[i],
            volume: result.v[i] || 0
          }));
        }
      } catch (err) {
        logger.debug?.(`[MarketData] Finnhub candles(${symbol}) failed: ${err.message}`);
      }
    }

    return [];
  };

  const fundamentals = async (symbol) => {
    if (!yahoo) return null;
    try {
      return await yahoo.fundamentals(symbol);
    } catch (err) {
      logger.debug?.(`[MarketData] fundamentals(${symbol}) failed: ${err.message}`);
      return null;
    }
  };

  const generalNews = async (category = 'general', minId = 0) => {
    if (finnhub) {
      try {
        const news = await finnhub.generalNews(category, minId);
        if (Array.isArray(news) && news.length > 3) return news;
      } catch (err) {
        logger.debug?.(`[MarketData] Finnhub news failed: ${err.message}`);
      }
    }

    if (yahoo) {
      try {
        const news = await yahoo.generalNews('stock market', 30);
        if (Array.isArray(news) && news.length > 0) return news;
      } catch (err) {
        logger.debug?.(`[MarketData] Yahoo news failed: ${err.message}`);
      }
    }

    return [];
  };

  const enrichWithFundamentals = async (symbols = []) => {
    if (!yahoo) return new Map();

    const results = new Map();
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const tasks = batch.map(async (sym) => {
        try {
          const fund = await yahoo.fundamentals(sym);
          if (fund) results.set(sym, fund);
        } catch {
          // skip
        }
      });
      await Promise.allSettled(tasks);

      if (i + batchSize < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return results;
  };

  const getStats = () => ({ ...stats });

  return {
    name: 'market-data-chain',
    quote,
    quoteBatch,
    historicalBars,
    fundamentals,
    generalNews,
    enrichWithFundamentals,
    getStats
  };
};

module.exports = { MarketDataProvider, createMarketDataProvider };
