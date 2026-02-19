import { api } from './apiClient';

const stats = {
  calls: 0,
  errors: 0,
  retries: 0,
  rateLimited: 0,
  fallbacks: 0,
  fallbackActive: false,
  lastError: '',
  lastCallAt: 0,
  source: 'backend_proxy_twelvedata'
};

const nowSec = () => Math.floor(Date.now() / 1000);

const trackCall = () => {
  stats.calls += 1;
  stats.lastCallAt = Date.now();
};

const trackError = (error, context = '') => {
  stats.errors += 1;
  stats.lastError = `${context}${error?.message ? `: ${error.message}` : ''}`.trim();
};

export const recordFinnhubProxyStats = ({ calls = 0, errors = 0, fallbacks = 0, lastError = '' } = {}) => {
  const nextCalls = Number(calls);
  const nextErrors = Number(errors);
  const nextFallbacks = Number(fallbacks);

  if (Number.isFinite(nextCalls) && nextCalls > 0) {
    stats.calls += nextCalls;
    stats.lastCallAt = Date.now();
  }
  if (Number.isFinite(nextErrors) && nextErrors > 0) {
    stats.errors += nextErrors;
  }
  if (Number.isFinite(nextFallbacks) && nextFallbacks > 0) {
    stats.fallbacks += nextFallbacks;
    stats.fallbackActive = true;
  }
  if (lastError) stats.lastError = String(lastError);
};

export const fetchAssetSnapshot = async (asset) => {
  try {
    if (!asset?.symbol) return null;
    trackCall();

    const symbol = String(asset.symbol).toUpperCase();
    const fromSec = nowSec() - 60 * 60 * 24 * 90;
    const toSec = nowSec();

    const quote = await api.quote(symbol);
    let candles = null;

    if (symbol.endsWith('USDT')) {
      candles = await api.cryptoCandles(symbol, fromSec, toSec).catch(() => null);
    } else if (symbol.includes('_')) {
      const [base, quoteCode] = symbol.split('_');
      candles = await api.forexCandles(base, quoteCode, fromSec, toSec).catch(() => null);
    } else {
      candles = await api.candles(symbol, fromSec, toSec).catch(() => null);
    }

    if (!quote?.c || !candles?.c?.length) return null;
    return { quote, candles };
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
  onStatus?.('disconnected');
  return { close: () => {} };
};

export const getFinnhubHealth = () => ({ ...stats });
