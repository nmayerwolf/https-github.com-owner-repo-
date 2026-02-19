const { env } = require('../config/env');

const BASE = 'https://api.twelvedata.com';

const createTwelveDataService = (options = {}) => {
  const base = options.base || BASE;
  const fetchImpl = options.fetchImpl || fetch;
  const keyProvider = options.keyProvider || (() => env.twelveDataKey);

  const hasKey = () => String(keyProvider() || '').trim().length > 0;

  const fetchTwelve = async (path, params = {}) => {
    const apikey = String(keyProvider() || '').trim();
    if (!apikey) throw new Error('Missing TWELVE_DATA_KEY');
    const qs = new URLSearchParams({ ...params, apikey });
    const res = await fetchImpl(`${base}${path}?${qs.toString()}`);
    if (!res.ok) {
      const err = new Error(`TwelveData HTTP ${res.status} ${path}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  };

  return {
    hasKey,
    quote: (symbol) => fetchTwelve('/quote', { symbol }),
    quoteBatch: (symbols) => fetchTwelve('/quote', { symbol: symbols.join(',') }),
    symbolSearch: (q, outputsize = 20) => fetchTwelve('/symbol_search', { symbol: q, outputsize })
  };
};

const service = createTwelveDataService();

module.exports = { ...service, createTwelveDataService };
