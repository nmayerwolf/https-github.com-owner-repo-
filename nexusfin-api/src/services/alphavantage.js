const { env } = require('../config/env');

const BASE = 'https://www.alphavantage.co/query';

const fetchAV = async (params = {}) => {
  const qs = new URLSearchParams({ ...params, apikey: env.alphaVantageKey });
  const res = await fetch(`${BASE}?${qs}`);
  if (!res.ok) throw new Error(`AlphaVantage HTTP ${res.status}`);
  return res.json();
};

const commodity = (fn) => fetchAV({ function: fn, interval: 'daily' });
const overview = (symbol) => fetchAV({ function: 'OVERVIEW', symbol });

module.exports = { commodity, overview };
