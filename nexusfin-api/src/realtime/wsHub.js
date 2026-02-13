const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { env } = require('../config/env');
const { tokenHash } = require('../middleware/auth');

const parseTokenFromUrl = (url = '') => {
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.searchParams.get('token');
  } catch {
    return null;
  }
};

const normalizeSymbols = (symbols = []) => {
  if (!Array.isArray(symbols)) return [];
  return symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean);
};

const startWSHub = (server) => {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const subscriptions = new Map();

  const closeWithCode = (ws, code, reason) => {
    try {
      ws.close(code, reason);
    } catch {
      ws.terminate();
    }
  };

  const setSubscribedSymbols = (ws, symbols = []) => {
    subscriptions.set(ws, new Set(normalizeSymbols(symbols)));
  };

  wss.on('connection', async (ws, req) => {
    const token = parseTokenFromUrl(req.url);
    if (!token) return closeWithCode(ws, 1008, 'TOKEN_REQUIRED');

    try {
      const payload = jwt.verify(token, env.jwtSecret);
      const session = await query('SELECT id FROM sessions WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()', [
        payload.userId,
        tokenHash(token)
      ]);
      if (!session.rows.length) return closeWithCode(ws, 1008, 'INVALID_SESSION');

      ws.user = { id: payload.userId, email: payload.email };
      setSubscribedSymbols(ws, []);

      ws.on('message', (raw) => {
        try {
          const data = JSON.parse(String(raw || '{}'));
          if (data.type === 'subscribe') {
            setSubscribedSymbols(ws, data.symbols);
            ws.send(JSON.stringify({ type: 'subscribed', symbols: Array.from(subscriptions.get(ws) || []) }));
          } else if (data.type === 'unsubscribe') {
            const current = subscriptions.get(ws) || new Set();
            for (const s of data.symbols || []) current.delete(String(s || '').trim().toUpperCase());
            subscriptions.set(ws, current);
            ws.send(JSON.stringify({ type: 'subscribed', symbols: Array.from(current) }));
          }
        } catch {
          ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MESSAGE' }));
        }
      });

      ws.on('close', () => {
        subscriptions.delete(ws);
      });

      ws.send(JSON.stringify({ type: 'ready' }));
    } catch {
      return closeWithCode(ws, 1008, 'TOKEN_EXPIRED');
    }
  });

  const broadcastPrice = ({ symbol, price, change, timestamp }) => {
    const upper = String(symbol || '').trim().toUpperCase();
    if (!upper) return;

    for (const client of wss.clients) {
      if (client.readyState !== client.OPEN) continue;
      const set = subscriptions.get(client);
      if (!set || !set.has(upper)) continue;
      client.send(
        JSON.stringify({
          type: 'price',
          symbol: upper,
          price,
          change,
          timestamp: timestamp || Date.now()
        })
      );
    }
  };

  const broadcastAlert = (alert) => {
    for (const client of wss.clients) {
      if (client.readyState !== client.OPEN) continue;
      if (client.user?.id !== alert?.userId) continue;
      client.send(JSON.stringify({ type: 'alert', alert }));
    }
  };

  return {
    wss,
    broadcastPrice,
    broadcastAlert,
    close: () => new Promise((resolve) => wss.close(resolve))
  };
};

module.exports = { startWSHub, parseTokenFromUrl, normalizeSymbols };
