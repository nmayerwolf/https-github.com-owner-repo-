const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

let token = null;
let csrfToken = null;
let authFailureHandler = null;

export const setToken = (next) => {
  token = next || null;
};

export const getToken = () => token;

export const isAuthenticated = () => !!token;

export const setCsrfToken = (next) => {
  csrfToken = next || null;
};

export const getCsrfToken = () => csrfToken;

export const setAuthFailureHandler = (handler) => {
  authFailureHandler = typeof handler === 'function' ? handler : null;
};

export const resetApiClientStateForTests = () => {
  token = null;
  csrfToken = null;
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

const isMutationMethod = (method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || 'GET').toUpperCase());

const request = async (path, options = {}) => {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (isMutationMethod(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const hadSession = !!token || !!csrfToken;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include'
  });

  const maybeRefresh = res.headers.get('X-Refresh-Token');
  if (maybeRefresh) token = maybeRefresh;

  if (!res.ok) {
    const err = await parseError(res);

    const authExpired = res.status === 401 && ['TOKEN_EXPIRED', 'INVALID_SESSION', 'TOKEN_REQUIRED', 'CSRF_INVALID'].includes(err?.error);
    if (hadSession && authExpired) {
      token = null;
      csrfToken = null;
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
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  updateMe: (data) => request('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  getCsrf: () => request('/auth/csrf'),
  getOAuthProviders: () => request('/auth/oauth/providers'),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPasswordWithToken: (token, newPassword) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
  resetPassword: (currentPassword, newPassword) =>
    request('/auth/reset-password/authenticated', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
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
  snapshot: (symbols = []) => {
    const clean = Array.isArray(symbols)
      ? symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean)
      : [];
    const q = clean.join(',');
    return request(`/market/snapshot?symbols=${encodeURIComponent(q)}`);
  },
  candles: (symbol, from, to, resolution = 'D') =>
    request(`/market/candles?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`),
  cryptoCandles: (symbol, from, to, resolution = 'D') =>
    request(`/market/crypto-candles?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`),
  forexCandles: (from, to, fromTs, toTs, resolution = 'D') =>
    request(`/market/forex-candles?from=${from}&to=${to}&fromTs=${fromTs}&toTs=${toTs}&resolution=${resolution}`),
  commodity: (fn, params = {}) => {
    const q = new URLSearchParams({ function: String(fn || '') });
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') q.set(k, String(v));
    });
    return request(`/market/commodity?${q.toString()}`);
  },
  profile: (symbol) => request(`/market/profile?symbol=${encodeURIComponent(symbol)}`),
  marketNews: (arg1 = {}, fromArg, toArg) => {
    const q = new URLSearchParams();
    if (typeof arg1 === 'string') {
      q.set('symbol', String(arg1 || ''));
      if (fromArg) q.set('from', fromArg);
      if (toArg) q.set('to', toArg);
    } else {
      const opts = arg1 || {};
      if (opts.symbol) q.set('symbol', String(opts.symbol));
      if (opts.category) q.set('category', String(opts.category));
      if (opts.from) q.set('from', String(opts.from));
      if (opts.to) q.set('to', String(opts.to));
      if (opts.minId != null) q.set('minId', String(opts.minId));
    }
    return request(`/market/news?${q.toString()}`);
  },

  getGroups: () => request('/groups'),
  createGroup: (name) => request('/groups', { method: 'POST', body: JSON.stringify({ name }) }),
  renameGroup: (id, name) => request('/groups/' + id, { method: 'PATCH', body: JSON.stringify({ name }) }),
  joinGroup: (code) => request('/groups/join', { method: 'POST', body: JSON.stringify({ code }) }),
  getGroup: (id) => request(`/groups/${id}`),
  getGroupFeed: (groupId, page = 1, limit = 30) => request(`/groups/${groupId}/feed?page=${page}&limit=${limit}`),
  reactToGroupEvent: (groupId, eventId, reaction) =>
    request(`/groups/${groupId}/feed/${eventId}/react`, { method: 'POST', body: JSON.stringify({ reaction }) }),
  leaveGroup: (id) => request(`/groups/${id}/leave`, { method: 'DELETE' }),
  deleteGroup: (id) => request(`/groups/${id}`, { method: 'DELETE' }),
  removeMember: (groupId, userId) => request(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  getAlerts: ({ page = 1, limit = 20, type = null } = {}) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (type) params.set('type', type);
    return request(`/alerts?${params.toString()}`);
  },
  getAlertDetail: (id) => request(`/alerts/${id}`),
  shareAlert: (alertId, groupId) => request(`/alerts/${alertId}/share`, { method: 'POST', body: JSON.stringify({ groupId }) }),

  getNotificationPreferences: () => request('/notifications/preferences'),
  updateNotificationPreferences: (data) => request('/notifications/preferences', { method: 'PUT', body: JSON.stringify(data) }),
  getNotificationPublicKey: () => request('/notifications/vapid-public-key'),
  subscribeNotifications: (subscription) =>
    request('/notifications/subscribe', { method: 'POST', body: JSON.stringify({ platform: 'web', subscription }) }),

  exportAlertPdf: async (alertId) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/export/alert/${encodeURIComponent(alertId)}?format=pdf`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const maybeRefresh = res.headers.get('X-Refresh-Token');
    if (maybeRefresh) token = maybeRefresh;

    if (!res.ok) {
      const err = await parseError(res);
      throw { status: res.status, ...(err || {}) };
    }

    return res.arrayBuffer();
  },

  exportPortfolioCsv: async (filter = 'all') => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/export/portfolio?format=csv&filter=${encodeURIComponent(filter)}`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const maybeRefresh = res.headers.get('X-Refresh-Token');
    if (maybeRefresh) token = maybeRefresh;

    if (!res.ok) {
      const err = await parseError(res);
      throw { status: res.status, ...(err || {}) };
    }

    return res.text();
  },

  migrate: (data) => request('/migrate', { method: 'POST', body: JSON.stringify(data) })
};
