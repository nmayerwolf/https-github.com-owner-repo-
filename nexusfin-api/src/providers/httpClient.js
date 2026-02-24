const { env } = require('../config/env');

const withTimeout = async (fetchImpl, url, options = {}, timeoutMs = env.externalFetchTimeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const ensureOk = async (res, context) => {
  if (res.ok) return res;
  const body = await res.text().catch(() => '');
  const err = new Error(`${context} HTTP ${res.status}`);
  err.status = res.status;
  err.body = body;
  throw err;
};

module.exports = { withTimeout, ensureOk };
