const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const KEY = import.meta.env.VITE_FINNHUB_KEY || 'd6742npr01qmckkc23sgd6742npr01qmckkc23t0';

let lastCallAt = 0;
const MIN_DELAY = 1300;

const stats = {
  calls: 0,
  errors: 0,
  rateLimited: 0,
  retries: 0,
  lastError: '',
  lastCallAt: 0
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rateLimit = async () => {
  const now = Date.now();
  const wait = MIN_DELAY - (now - lastCallAt);
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
};

const get = async (path, params = {}) => {
  await rateLimit();
  stats.calls += 1;
  stats.lastCallAt = Date.now();

  const q = new URLSearchParams({ ...params, token: KEY }).toString();
  const res = await fetch(`${FINNHUB_BASE}${path}?${q}`);
  if (res.status === 429) {
    stats.rateLimited += 1;
    stats.retries += 1;
    await sleep(60000);
    return get(path, params);
  }
  if (!res.ok) {
    stats.errors += 1;
    stats.lastError = `HTTP ${res.status} on ${path}`;
    throw new Error(`Finnhub error ${res.status}`);
  }
  return res.json();
};

const nowSec = Math.floor(Date.now() / 1000);
const fromSec = nowSec - 60 * 60 * 24 * 90;

export const fetchAssetSnapshot = async (asset) => {
  try {
    if (asset.source === 'finnhub_stock') {
      const [quote, candles] = await Promise.all([
        get('/quote', { symbol: asset.symbol }),
        get('/stock/candle', { symbol: asset.symbol, resolution: 'D', from: fromSec, to: nowSec })
      ]);
      return { quote, candles };
    }

    if (asset.source === 'finnhub_crypto') {
      const [quote, candles] = await Promise.all([
        get('/quote', { symbol: `BINANCE:${asset.symbol}` }),
        get('/crypto/candle', { symbol: `BINANCE:${asset.symbol}`, resolution: 'D', from: fromSec, to: nowSec })
      ]);
      return { quote, candles };
    }

    if (asset.source === 'finnhub_fx') {
      const [quote, candles] = await Promise.all([
        get('/quote', { symbol: `OANDA:${asset.symbol}` }),
        get('/forex/candle', { symbol: `OANDA:${asset.symbol}`, resolution: 'D', from: fromSec, to: nowSec })
      ]);
      return { quote, candles };
    }

    return null;
  } catch (error) {
    stats.errors += 1;
    stats.lastError = `snapshot ${asset.symbol}: ${error.message}`;
    console.error('fetchAssetSnapshot error', asset.symbol, error);
    return null;
  }
};

export const fetchCompanyNews = async (symbol) => {
  try {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10);
    const data = await get('/company-news', { symbol, from, to });
    return Array.isArray(data) ? data.slice(0, 8) : [];
  } catch {
    return [];
  }
};

export const fetchCompanyProfile = async (symbol) => {
  try {
    return await get('/stock/profile2', { symbol });
  } catch {
    return null;
  }
};

export const createFinnhubSocket = ({ symbols, onTrade, onStatus }) => {
  if (!symbols?.length) return { close: () => {} };

  let ws;
  let reconnectTimer;
  let stopped = false;

  const connect = () => {
    ws = new WebSocket(`wss://ws.finnhub.io?token=${KEY}`);

    ws.onopen = () => {
      onStatus?.('connected');
      symbols.forEach((symbol) => ws.send(JSON.stringify({ type: 'subscribe', symbol })));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'trade' && Array.isArray(payload.data)) {
          payload.data.forEach((trade) => {
            if (trade.s && Number.isFinite(trade.p)) {
              onTrade?.({ symbol: trade.s, price: trade.p, ts: trade.t });
            }
          });
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    ws.onerror = () => {
      stats.errors += 1;
      stats.lastError = 'WebSocket error';
      onStatus?.('error');
    };

    ws.onclose = () => {
      onStatus?.('disconnected');
      if (!stopped) reconnectTimer = setTimeout(connect, 10000);
    };
  };

  connect();

  return {
    close: () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        // No-op.
      }
    }
  };
};

export const getFinnhubHealth = () => ({ ...stats });
