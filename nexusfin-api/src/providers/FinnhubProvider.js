const finnhub = require('../services/finnhub');
const { MarketDataProvider } = require('./MarketDataProvider');

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const normalizeBars = (symbol, payload = {}) => {
  const opens = Array.isArray(payload.o) ? payload.o : [];
  const highs = Array.isArray(payload.h) ? payload.h : [];
  const lows = Array.isArray(payload.l) ? payload.l : [];
  const closes = Array.isArray(payload.c) ? payload.c : [];
  const volumes = Array.isArray(payload.v) ? payload.v : [];
  const times = Array.isArray(payload.t) ? payload.t : [];

  const len = Math.min(opens.length, highs.length, lows.length, closes.length, times.length);
  const out = [];
  for (let i = 0; i < len; i += 1) {
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

class FinnhubProvider extends MarketDataProvider {
  constructor(client = finnhub) {
    super();
    this.client = client;
  }

  async getDailyBars(symbols = [], from, to) {
    const uniqueSymbols = Array.from(new Set((Array.isArray(symbols) ? symbols : []).map((s) => String(s || '').toUpperCase()))).filter(Boolean);
    const fromTs = Number(from);
    const toTs = Number(to);
    if (!uniqueSymbols.length || !Number.isFinite(fromTs) || !Number.isFinite(toTs)) return [];

    const all = [];
    for (const symbol of uniqueSymbols) {
      const candles = await this.client.candles(symbol, 'D', fromTs, toTs);
      all.push(...normalizeBars(symbol, candles));
    }
    return all;
  }

  async getFundamentals(symbols = []) {
    const uniqueSymbols = Array.from(new Set((Array.isArray(symbols) ? symbols : []).map((s) => String(s || '').toUpperCase()))).filter(Boolean);
    const rows = [];
    for (const symbol of uniqueSymbols) {
      const profile = await this.client.profile(symbol).catch(() => null);
      if (!profile || typeof profile !== 'object') continue;
      rows.push({
        symbol,
        asofDate: new Date().toISOString().slice(0, 10),
        pe: null,
        evEbitda: null,
        fcfYield: null,
        raw: profile
      });
    }
    return rows;
  }

  async getNews(from, to, queryTags = []) {
    const fromDate = String(from || '');
    const toDate = String(to || '');
    const tags = Array.isArray(queryTags) ? queryTags : [];
    const news = [];
    const categories = ['general', 'forex', 'crypto', 'merger'];

    for (const tag of tags) {
      const symbol = String(tag || '').toUpperCase().trim();
      if (!symbol) continue;
      const items = await this.client.companyNews(symbol, fromDate, toDate).catch(() => []);
      for (const item of items || []) {
        news.push({
          id: String(item.id || `${symbol}-${item.datetime || item.headline || Math.random()}`),
          ts: new Date(Number(item.datetime || 0) * 1000 || Date.now()).toISOString(),
          source: item.source || null,
          headline: item.headline || '',
          summary: item.summary || '',
          tags: [],
          tickers: [symbol],
          url: item.url || null,
          raw: item
        });
      }
    }

    const delayMs = process.env.NODE_ENV === 'test' ? 0 : 1300;
    for (const category of categories) {
      const feed = await this.client.generalNews(category, 0).catch(() => []);
      for (const item of feed || []) {
        news.push({
          id: String(item.id || `${category}-${item.datetime || item.headline || Math.random()}`),
          ts: new Date(Number(item.datetime || 0) * 1000 || Date.now()).toISOString(),
          source: item.source || null,
          headline: item.headline || '',
          summary: item.summary || '',
          tags: [category],
          tickers: [],
          url: item.url || null,
          raw: {
            ...item,
            category
          }
        });
      }
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const seen = new Set();
    return news.filter((item) => {
      const url = String(item?.url || '').trim().toLowerCase();
      if (!url) return false;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }
}

module.exports = { FinnhubProvider };
