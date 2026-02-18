const trimSlash = (value = '') => String(value || '').replace(/\/+$/, '');

const ensureApiSuffix = (value = '') => {
  const base = trimSlash(value);
  if (!base) return '';
  return base.endsWith('/api') ? base : `${base}/api`;
};

export const getApiBaseUrl = () => {
  const raw = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
  const normalized = ensureApiSuffix(raw);
  return normalized || 'http://localhost:3001/api';
};

export const getWsBaseUrl = () => {
  const explicit = trimSlash(import.meta.env.VITE_WS_URL || '');
  if (explicit) return explicit;

  const apiBase = getApiBaseUrl();
  try {
    const url = new URL(apiBase);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = url.host;
    return `${wsProtocol}//${host}/ws`;
  } catch {
    return 'ws://localhost:3001/ws';
  }
};
