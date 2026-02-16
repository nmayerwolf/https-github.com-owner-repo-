import { getToken } from './apiClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const buildWsUrl = () => {
  const apiUrl = new URL(API_BASE, window.location.origin);
  const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsBasePath = apiUrl.pathname.replace(/\/api\/?$/, '');
  return `${wsProtocol}//${apiUrl.host}${wsBasePath}/ws`;
};

const normalizeSymbols = (symbols = []) =>
  Array.isArray(symbols) ? symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean) : [];

export const createBackendSocket = ({ symbols = [], onTrade, onAlert, onStatus } = {}) => {
  const subscribedSymbols = normalizeSymbols(symbols);
  let ws = null;
  let reconnectTimer = null;
  let stopped = false;
  let hadOpen = false;

  const connect = () => {
    const url = new URL(buildWsUrl());
    const token = getToken();
    if (token) url.searchParams.set('token', token);

    ws = new WebSocket(url.toString());

    ws.onopen = () => {
      hadOpen = true;
      onStatus?.('connected');
    };

    ws.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(String(event.data || '{}'));
      } catch {
        return;
      }

      if (payload.type === 'ready') {
        ws.send(JSON.stringify({ type: 'subscribe', symbols: subscribedSymbols }));
        return;
      }

      if (payload.type === 'price' && payload.symbol && Number.isFinite(Number(payload.price))) {
        onTrade?.({
          symbol: String(payload.symbol).toUpperCase(),
          price: Number(payload.price),
          ts: Number(payload.timestamp || Date.now())
        });
      }

      if (payload.type === 'alert' && payload.alert) {
        onAlert?.(payload.alert);
      }
    };

    ws.onerror = () => {};

    ws.onclose = (event) => {
      const code = Number(event?.code || 0);
      const reason = String(event?.reason || '');
      const authFailure = code === 1008 && ['TOKEN_REQUIRED', 'TOKEN_EXPIRED', 'INVALID_SESSION'].includes(reason);

      if (authFailure) {
        onStatus?.('auth_error');
        return;
      }

      onStatus?.('disconnected');
      if (!stopped) reconnectTimer = setTimeout(connect, hadOpen ? 5000 : 2000);
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
        // no-op
      }
    }
  };
};
