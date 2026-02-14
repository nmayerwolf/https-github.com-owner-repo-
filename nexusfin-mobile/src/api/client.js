import Constants from 'expo-constants';

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'http://localhost:3001/api';

let token = null;

export const setToken = (next) => {
  token = next || null;
};

export const getToken = () => token;
export const getApiBase = () => API_BASE;
export const getAuthBase = () => API_BASE.replace(/\/api\/?$/, '');

const request = async (path, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    let err = { message: `HTTP ${res.status}` };
    try {
      err = await res.json();
    } catch {
      // ignore
    }
    throw { status: res.status, ...(err || {}) };
  }

  if (res.status === 204) return null;
  return res.json();
};

export const api = {
  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      headers: { 'x-client-platform': 'mobile' },
      body: JSON.stringify({ email, password })
    }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  getOAuthProviders: () => request('/auth/oauth/providers'),
  getMobileOAuthUrl: (provider) => {
    const authBase = getAuthBase();
    const redirectUri = encodeURIComponent('nexusfin://oauth');
    return `${authBase}/api/auth/${encodeURIComponent(String(provider || '').toLowerCase())}?platform=mobile&redirect_uri=${redirectUri}`;
  },
  updateMe: (data) => request('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  getConfig: () => request('/config'),
  updateConfig: (data) => request('/config', { method: 'PUT', body: JSON.stringify(data) }),
  quote: (symbol) => request(`/market/quote?symbol=${encodeURIComponent(symbol)}`),
  getWatchlist: () => request('/watchlist'),
  addToWatchlist: (data) => request('/watchlist', { method: 'POST', body: JSON.stringify(data) }),
  removeFromWatchlist: (symbol) => request(`/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
  getAlerts: ({ page = 1, limit = 20, type = null } = {}) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (type) params.set('type', type);
    return request(`/alerts?${params.toString()}`);
  },
  shareAlertToGroup: (alertId, { groupId, message = '' }) =>
    request(`/alerts/${encodeURIComponent(alertId)}/share`, {
      method: 'POST',
      body: JSON.stringify({ groupId, message })
    }),
  getGroups: () => request('/groups'),
  createGroup: ({ name }) =>
    request('/groups', {
      method: 'POST',
      body: JSON.stringify({ name })
    }),
  joinGroup: ({ code }) =>
    request('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ code })
    }),
  leaveGroup: (groupId) => request(`/groups/${encodeURIComponent(groupId)}/leave`, { method: 'DELETE' }),
  deleteGroup: (groupId) => request(`/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' }),
  renameGroup: (groupId, { name }) =>
    request(`/groups/${encodeURIComponent(groupId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    }),
  getGroupDetail: (groupId) => request(`/groups/${encodeURIComponent(groupId)}`),
  removeGroupMember: (groupId, userId) => request(`/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  getGroupFeed: (groupId, { page = 1, limit = 30 } = {}) =>
    request(`/groups/${encodeURIComponent(groupId)}/feed?page=${encodeURIComponent(String(page))}&limit=${encodeURIComponent(String(limit))}`),
  createGroupFeedNote: (groupId, { message }) =>
    request(`/groups/${encodeURIComponent(groupId)}/feed`, {
      method: 'POST',
      body: JSON.stringify({ message })
    }),
  reactGroupEvent: (groupId, eventId, reaction) =>
    request(`/groups/${encodeURIComponent(groupId)}/feed/${encodeURIComponent(eventId)}/react`, {
      method: 'POST',
      body: JSON.stringify({ reaction })
    }),
  getNotificationPreferences: () => request('/notifications/preferences'),
  updateNotificationPreferences: (data) =>
    request('/notifications/preferences', { method: 'PUT', body: JSON.stringify(data) }),
  sendTestNotification: (data = {}) =>
    request('/notifications/test', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  subscribePush: ({ platform, expoPushToken }) =>
    request('/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify({ platform, expoPushToken })
    }),
  getPushSubscriptions: () => request('/notifications/subscriptions'),
  deletePushSubscription: (id) => request(`/notifications/subscribe/${id}`, { method: 'DELETE' })
};
