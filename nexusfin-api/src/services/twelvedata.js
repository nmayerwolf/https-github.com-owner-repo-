const { env } = require('../config/env');

const BASE = 'https://api.twelvedata.com';

const createTwelveDataService = (options = {}) => {
  const base = options.base || BASE;
  const fetchImpl = options.fetchImpl || fetch;
  const keyProvider = options.keyProvider || (() => env.twelveDataKey);

  const hasKey = () => String(keyProvider() || '').trim().length > 0;

  const fetchTwelve = async (path, params = {}) => {
    const apikey = String(keyProvider() || '').trim();
    if (!apikey) {
      const err = new Error('Missing TWELVE_DATA_KEY');
      err.code = 'TWELVE_DATA_KEY_MISSING';
      throw err;
    }

    const qs = new URLSearchParams({ ...params, apikey });
    const res = await fetchImpl(`${base}${path}?${qs.toString()}`);
    if (!res.ok) {
      const err = new Error(`TwelveData HTTP ${res.status} ${path}`);
      err.code = 'TWELVEDATA_HTTP_ERROR';
      err.status = res.status;
      throw err;
    }

    const body = await res.json();
    const status = String(body?.status || '').toLowerCase();
    if (status === 'error' || body?.code) {
      const err = new Error(String(body?.message || body?.code || 'TwelveData error'));
      err.code = 'TWELVEDATA_API_ERROR';
      err.details = body;
      throw err;
    }

    return body;
  };

  return {
    hasKey,
    quote: (symbol) => fetchTwelve('/quote', { symbol }),
    symbolSearch: (q, outputsize = 20) => fetchTwelve('/symbol_search', { symbol: q, outputsize })
  };
};

const service = createTwelveDataService();

module.exports = { ...service, createTwelveDataService };
