import { api } from './apiClient';

const stats = {
  calls: 0,
  errors: 0,
  retries: 0,
  rateLimited: 0,
  lastError: '',
  lastCallAt: 0,
  source: 'backend_proxy'
};

const nowSec = Math.floor(Date.now() / 1000);
const fromSec = nowSec - 60 * 60 * 24 * 90;
const buildSyntheticCandles = (price, prevClose = null, points = 90) => {
  const current = Number(price);
  const previous = Number(prevClose);
  if (!Number.isFinite(current) || current <= 0) return null;
  const start = Number.isFinite(previous) && previous > 0 ? previous : current;
  const step = points > 1 ? (current - start) / (points - 1) : 0;
  const c = Array.from({ length: points }, (_, idx) => Number((start + step * idx).toFixed(6)));
  return {
    c,
    h: c.map((v) => Number((v * 1.002).toFixed(6))),
    l: c.map((v) => Number((v * 0.998).toFixed(6))),
    v: c.map(() => 0)
  };
};

const trackCall = () => {
  stats.calls += 1;
  stats.lastCallAt = Date.now();
};

const trackError = (error, context = '') => {
  stats.errors += 1;
  stats.lastError = `${context}${error?.message ? `: ${error.message}` : ''}`.trim();
};

export const fetchAssetSnapshot = async (asset) => {
  try {
    if (!asset?.source) return null;
    trackCall();

    if (asset.source === 'finnhub_stock') {
      const quote = await api.quote(asset.symbol);
      const candles = await api.candles(asset.symbol, fromSec, nowSec).catch(() => null);
      const safeCandles = candles?.c?.length ? candles : buildSyntheticCandles(quote?.c, quote?.pc);
      if (!safeCandles) return null;
      return { quote, candles: safeCandles };
    }

    if (asset.source === 'finnhub_crypto') {
      const quote = await api.quote(`BINANCE:${asset.symbol}`);
      const candles = await api.cryptoCandles(asset.symbol, fromSec, nowSec).catch(() => null);
      const safeCandles = candles?.c?.length ? candles : buildSyntheticCandles(quote?.c, quote?.pc);
      if (!safeCandles) return null;
      return { quote, candles: safeCandles };
    }

    if (asset.source === 'finnhub_fx') {
      const [base, quoteCode] = String(asset.symbol).split('_');
      const quote = await api.quote(`OANDA:${asset.symbol}`);
      const candles = await api.forexCandles(base, quoteCode, fromSec, nowSec).catch(() => null);
      const safeCandles = candles?.c?.length ? candles : buildSyntheticCandles(quote?.c, quote?.pc);
      if (!safeCandles) return null;
      return { quote, candles: safeCandles };
    }

    return null;
  } catch (error) {
    trackError(error, `snapshot ${asset?.symbol || ''}`);
    return null;
  }
};

export const fetchCompanyNews = async (symbol) => {
  try {
    trackCall();
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10);
    const out = await api.marketNews(symbol, from, to);
    return Array.isArray(out) ? out.slice(0, 8) : [];
  } catch (error) {
    trackError(error, `news ${symbol}`);
    return [];
  }
};

export const fetchCompanyProfile = async (symbol) => {
  try {
    trackCall();
    const out = await api.profile(symbol);
    return out || null;
  } catch (error) {
    trackError(error, `profile ${symbol}`);
    return null;
  }
};

export const createFinnhubSocket = ({ onStatus } = {}) => {
  // Local mode has no direct provider websocket anymore.
  onStatus?.('disconnected');
  return {
    close: () => {}
  };
};

export const getFinnhubHealth = () => ({ ...stats });
