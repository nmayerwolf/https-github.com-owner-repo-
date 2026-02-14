import Constants from 'expo-constants';

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'http://localhost:3001/api';

let token = null;

export const setToken = (next) => {
  token = next || null;
};

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
  me: () => request('/auth/me'),
  getAlerts: () => request('/alerts?page=1&limit=20'),
  getNotificationPreferences: () => request('/notifications/preferences'),
  updateNotificationPreferences: (data) =>
    request('/notifications/preferences', { method: 'PUT', body: JSON.stringify(data) }),
  subscribePush: ({ platform, expoPushToken }) =>
    request('/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify({ platform, expoPushToken })
    }),
  getPushSubscriptions: () => request('/notifications/subscriptions'),
  deletePushSubscription: (id) => request(`/notifications/subscribe/${id}`, { method: 'DELETE' })
};
