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
      const [quote, candles] = await Promise.all([api.quote(asset.symbol), api.candles(asset.symbol, fromSec, nowSec)]);
      return { quote, candles };
    }

    if (asset.source === 'finnhub_crypto') {
      const [quote, candles] = await Promise.all([api.quote(`BINANCE:${asset.symbol}`), api.cryptoCandles(asset.symbol, fromSec, nowSec)]);
      return { quote, candles };
    }

    if (asset.source === 'finnhub_fx') {
      const [base, quoteCode] = String(asset.symbol).split('_');
      const [quote, candles] = await Promise.all([
        api.quote(`OANDA:${asset.symbol}`),
        api.forexCandles(base, quoteCode, fromSec, nowSec)
      ]);
      return { quote, candles };
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
