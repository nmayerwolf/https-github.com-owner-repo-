const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

let token = null;
let authFailureHandler = null;

export const setToken = (next) => {
  token = next || null;
};

export const getToken = () => token;

export const isAuthenticated = () => !!token;

export const setAuthFailureHandler = (handler) => {
  authFailureHandler = typeof handler === 'function' ? handler : null;
};

export const resetApiClientStateForTests = () => {
  token = null;
  authFailureHandler = null;
};

const parseError = async (res) => {
  try {
    const json = await res.json();
    return json;
  } catch {
    return { message: `HTTP ${res.status}` };
  }
};

const request = async (path, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const hadToken = !!token;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const maybeRefresh = res.headers.get('X-Refresh-Token');
  if (maybeRefresh) token = maybeRefresh;

  if (!res.ok) {
    const err = await parseError(res);

    const authExpired = res.status === 401 && (err?.error === 'TOKEN_EXPIRED' || err?.error === 'INVALID_SESSION');
    if (hadToken && authExpired) {
      token = null;
      if (authFailureHandler) authFailureHandler(err);
    }

    throw { status: res.status, ...(err || {}) };
  }

  if (res.status === 204) return null;
  return res.json();
};

export const api = {
  register: (email, password) => request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  refresh: () => request('/auth/refresh', { method: 'POST' }),
  resetPassword: (currentPassword, newPassword) =>
    request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  health: () => request('/health'),

  getPortfolio: () => request('/portfolio'),
  addPosition: (data) => request('/portfolio', { method: 'POST', body: JSON.stringify(data) }),
  updatePosition: (id, data) => request(`/portfolio/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePosition: (id) => request(`/portfolio/${id}`, { method: 'DELETE' }),

  getConfig: () => request('/config'),
  updateConfig: (data) => request('/config', { method: 'PUT', body: JSON.stringify(data) }),

  getWatchlist: () => request('/watchlist'),
  addToWatchlist: (data) => request('/watchlist', { method: 'POST', body: JSON.stringify(data) }),
  removeFromWatchlist: (symbol) => request(`/watchlist/${symbol}`, { method: 'DELETE' }),

  quote: (symbol) => request(`/market/quote?symbol=${encodeURIComponent(symbol)}`),
  candles: (symbol, from, to, resolution = 'D') =>
    request(`/market/candles?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`),
  cryptoCandles: (symbol, from, to, resolution = 'D') =>
    request(`/market/crypto-candles?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`),
  forexCandles: (from, to, fromTs, toTs, resolution = 'D') =>
    request(`/market/forex-candles?from=${from}&to=${to}&fromTs=${fromTs}&toTs=${toTs}&resolution=${resolution}`),
  commodity: (fn) => request(`/market/commodity?function=${fn}`),
  profile: (symbol) => request(`/market/profile?symbol=${encodeURIComponent(symbol)}`),

  getGroups: () => request('/groups'),
  createGroup: (name) => request('/groups', { method: 'POST', body: JSON.stringify({ name }) }),
  renameGroup: (id, name) => request('/groups/' + id, { method: 'PATCH', body: JSON.stringify({ name }) }),
  joinGroup: (code) => request('/groups/join', { method: 'POST', body: JSON.stringify({ code }) }),
  getGroup: (id) => request(`/groups/${id}`),
  leaveGroup: (id) => request(`/groups/${id}/leave`, { method: 'DELETE' }),
  removeMember: (groupId, userId) => request(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  migrate: (data) => request('/migrate', { method: 'POST', body: JSON.stringify(data) })
};
