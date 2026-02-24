import { getApiBaseUrl } from './env';

const API_BASE = getApiBaseUrl();

let token = null;
let csrfToken = null;
let authFailureHandler = null;
let tokenUpdateHandler = null;

const setInMemoryToken = (next, { notify = true } = {}) => {
  token = next || null;
  if (notify && tokenUpdateHandler) tokenUpdateHandler(token);
};

export const setToken = (next) => setInMemoryToken(next);
export const getToken = () => token;
export const isAuthenticated = () => !!token;
export const setCsrfToken = (next) => {
  csrfToken = next || null;
};
export const getCsrfToken = () => csrfToken;
export const setAuthFailureHandler = (handler) => {
  authFailureHandler = typeof handler === 'function' ? handler : null;
};
export const setTokenUpdateHandler = (handler) => {
  tokenUpdateHandler = typeof handler === 'function' ? handler : null;
};

export const resetApiClientStateForTests = () => {
  token = null;
  csrfToken = null;
  authFailureHandler = null;
  tokenUpdateHandler = null;
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
  if (maybeRefresh) setInMemoryToken(maybeRefresh);

  if (!res.ok) {
    const err = await parseError(res);
    const authExpired =
      res.status === 401 && ['TOKEN_EXPIRED', 'INVALID_SESSION', 'TOKEN_REQUIRED', 'CSRF_INVALID'].includes(err?.error || err?.code);

    if (hadSession && authExpired) {
      setInMemoryToken(null);
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

  health: () => request('/health'),

  getBriefToday: () => request('/brief/today'),
  getBriefByDate: (date) => request(`/brief/${encodeURIComponent(String(date || ''))}`),

  getIdeas: (status = null) => request(`/ideas${status ? `?status=${encodeURIComponent(String(status).toLowerCase())}` : ''}`),
  analyzeIdeaPrompt: (prompt) => request('/ideas/analyze', { method: 'POST', body: JSON.stringify({ prompt }) }),
  reviewIdeaNow: (id) => request(`/ideas/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify({}) }),
  closeIdea: (id, reason) => request(`/ideas/${encodeURIComponent(id)}/close`, { method: 'POST', body: JSON.stringify({ reason }) }),

  getPackagesToday: () => request('/packages/today'),
  getPackageByDate: (date) => request(`/packages/${encodeURIComponent(String(date || ''))}`),

  getPortfolio: () => request('/portfolio'),
  upsertPortfolio: (holdings, date = null) => request('/portfolio', { method: 'POST', body: JSON.stringify({ holdings, date }) }),
  upsertPortfolioHoldings: (holdings, date = null) => request('/portfolio/holdings', { method: 'POST', body: JSON.stringify({ holdings, date }) }),
  getPortfolioChallenges: () => request('/portfolio/challenges'),

  runAdminJobs: (payload = {}) => request('/admin/jobs/run', { method: 'POST', body: JSON.stringify(payload) }),
  getAdminJobsStatus: () => request('/admin/jobs/status')
};
