/**
 * FallbackProvider — Extends MarketDataProvider with Finnhub → Yahoo fallback.
 *
 * Drop-in replacement for FinnhubProvider in marketIngestion.js.
 * Tries Finnhub first per-symbol; if forbidden/empty, falls back to Yahoo.
 *
 * USAGE:
 *   const { FallbackProvider } = require('../providers/FallbackProvider');
 *   const { createYahooProvider } = require('../providers/YahooFinanceProvider');
 *   const finnhubClient = require('../services/finnhub');
 *
 *   const yahoo = createYahooProvider({ logger });
 *   const provider = new FallbackProvider({ finnhubClient, yahoo, logger });
 *
 *   // Use exactly like FinnhubProvider:
 *   const ingestion = createMarketIngestionService({ query, provider, logger });
 */

const { MarketDataProvider } = require('./MarketDataProvider');

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const normalizeFinnhubBars = (symbol, payload = {}) => {
  const opens = Array.isArray(payload.o) ? payload.o : [];
  const highs = Array.isArray(payload.h) ? payload.h : [];
  const lows = Array.isArray(payload.l) ? payload.l : [];
  const closes = Array.isArray(payload.c) ? payload.c : [];
  const volumes = Array.isArray(payload.v) ? payload.v : [];
  const times = Array.isArray(payload.t) ? payload.t : [];

  const len = Math.min(opens.length, highs.length, lows.length, closes.length, times.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const ts = Number(times[i]);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const open = toFinite(opens[i]);
    const high = toFinite(highs[i]);
    const low = toFinite(lows[i]);
    const close = toFinite(closes[i]);
    if (![open, high, low, close].every((x) => Number.isFinite(x))) continue;
    out.push({
      symbol,
      ts,
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: toFinite(volumes[i])
    });
  }
  return out;
};

const isForbidden = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error || '').toUpperCase();
  const status = Number(error?.status);
  return (
    code === 'FINNHUB_ENDPOINT_FORBIDDEN' ||
    message.includes('FORBIDDEN') ||
    status === 403 ||
    status === 401
  );
};

class FallbackProvider extends MarketDataProvider {
  constructor({ finnhubClient = null, yahoo = null, logger = console } = {}) {
    super();
    this.finnhub = finnhubClient;
    this.yahoo = yahoo;
    this.logger = logger;
    this.stats = { finnhubOk: 0, finnhubFail: 0, yahooOk: 0, yahooFail: 0 };
  }

  /**
   * getDailyBars — tries Finnhub per symbol, falls back to Yahoo per symbol.
   * Same signature and return shape as FinnhubProvider.getDailyBars.
   */
  async getDailyBars(symbols = [], from, to) {
    const unique = Array.from(
      new Set((Array.isArray(symbols) ? symbols : []).map((s) => String(s || '').toUpperCase()).filter(Boolean))
    );
    const fromTs = Number(from);
    const toTs = Number(to);
    if (!unique.length || !Number.isFinite(fromTs) || !Number.isFinite(toTs)) return [];

    const fromDate = new Date(fromTs * 1000).toISOString().slice(0, 10);
    const toDate = new Date(toTs * 1000).toISOString().slice(0, 10);

    const all = [];
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 300;

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const batch = unique.slice(i, i + BATCH_SIZE);

      const tasks = batch.map(async (symbol) => {
        // 1) Try Finnhub first
        if (this.finnhub) {
          try {
            const candles = await this.finnhub.candles(symbol, 'D', fromTs, toTs);
            const bars = normalizeFinnhubBars(symbol, candles);
            if (bars.length > 0) {
              this.stats.finnhubOk++;
              return bars;
            }
          } catch (err) {
            if (!isForbidden(err)) {
              this.logger.warn?.(`[FallbackProvider] Finnhub hard error for ${symbol}: ${err.message}`);
            }
          }
          this.stats.finnhubFail++;
        }

        // 2) Fallback to Yahoo
        if (this.yahoo) {
          try {
            const yahooBars = await this.yahoo.historicalBars(symbol, {
              startDate: fromDate,
              endDate: toDate,
              interval: '1d'
            });
            if (yahooBars && yahooBars.length > 0) {
              this.stats.yahooOk++;
              // Normalize to same shape as Finnhub bars
              return yahooBars.map((bar) => ({
                symbol,
                ts: Math.floor(new Date(`${bar.date}T00:00:00Z`).getTime() / 1000),
                date: bar.date,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume
              }));
            }
          } catch (err) {
            this.logger.warn?.(`[FallbackProvider] Yahoo failed for ${symbol}: ${err.message}`);
          }
          this.stats.yahooFail++;
        }

        return [];
      });

      const results = await Promise.allSettled(tasks);
      for (const result of results) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          all.push(...result.value);
        }
      }

      // Delay between batches to avoid rate limits
      if (BATCH_DELAY_MS > 0 && i + BATCH_SIZE < unique.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    this.logger.log?.('[FallbackProvider] getDailyBars done', {
      symbols: unique.length,
      barsTotal: all.length,
      ...this.stats
    });

    return all;
  }

  /**
   * getFundamentals — Yahoo provides PE/EPS/sector; Finnhub free does not.
   */
  async getFundamentals(symbols = []) {
    const unique = Array.from(
      new Set((Array.isArray(symbols) ? symbols : []).map((s) => String(s || '').toUpperCase()).filter(Boolean))
    );

    const rows = [];

    // Try Finnhub first (returns basic profile)
    if (this.finnhub) {
      for (const symbol of unique) {
        try {
          const profile = await this.finnhub.profile(symbol);
          if (profile && typeof profile === 'object') {
            rows.push({
              symbol,
              asofDate: new Date().toISOString().slice(0, 10),
              pe: null,
              evEbitda: null,
              fcfYield: null,
              raw: profile
            });
          }
        } catch {
          // continue to yahoo
        }
      }
    }

    // Enrich with Yahoo fundamentals (PE, EPS, sector, etc.)
    if (this.yahoo) {
      const covered = new Set(rows.map((r) => r.symbol));
      const missing = unique.filter((s) => !covered.has(s));

      const BATCH_SIZE = 5;
      for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        const batch = missing.slice(i, i + BATCH_SIZE);
        const tasks = batch.map(async (symbol) => {
          try {
            const fund = await this.yahoo.fundamentals(symbol);
            if (fund) {
              rows.push({
                symbol,
                asofDate: new Date().toISOString().slice(0, 10),
                pe: fund.pe,
                evEbitda: null,
                fcfYield: null,
                raw: fund
              });
            }
          } catch {
            // skip
          }
        });
        await Promise.allSettled(tasks);
        if (i + BATCH_SIZE < missing.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }

    return rows;
  }

  /**
   * getNews — Finnhub first, Yahoo fallback.
   * Same signature as FinnhubProvider.getNews.
   */
  async getNews(from, to, queryTags = []) {
    // Try Finnhub
    if (this.finnhub) {
      try {
        const { FinnhubProvider } = require('./FinnhubProvider');
        const fp = new FinnhubProvider(this.finnhub);
        const news = await fp.getNews(from, to, queryTags);
        if (Array.isArray(news) && news.length > 0) return news;
      } catch (err) {
        this.logger.warn?.('[FallbackProvider] Finnhub news failed:', err.message);
      }
    }

    // Fallback to Yahoo
    if (this.yahoo) {
      try {
        const yahooNews = await this.yahoo.generalNews('stock market economy', 50);
        return yahooNews.map((item) => ({
          id: `yahoo-${item.headline?.slice(0, 40) || Math.random()}`,
          ts: item.ts || new Date().toISOString(),
          source: item.source || 'Yahoo Finance',
          headline: item.headline || '',
          summary: '',
          tags: [],
          tickers: item.tickers || [],
          url: item.url || null,
          raw: item
        }));
      } catch (err) {
        this.logger.warn?.('[FallbackProvider] Yahoo news failed:', err.message);
      }
    }

    return [];
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = { FallbackProvider };
