const { env } = require('../config/env');

const BASE = 'https://www.alphavantage.co/query';

const fetchAV = async (params = {}) => {
  if (!String(env.alphaVantageKey || '').trim()) throw new Error('Missing ALPHA_VANTAGE_KEY');
  const qs = new URLSearchParams({ ...params, apikey: env.alphaVantageKey });
  const res = await fetch(`${BASE}?${qs}`);
  if (!res.ok) throw new Error(`AlphaVantage HTTP ${res.status}`);
  return res.json();
};

const commodity = (fn, params = {}) => fetchAV({ function: fn, interval: 'daily', ...params });
const overview = (symbol) => fetchAV({ function: 'OVERVIEW', symbol });
const globalQuote = (symbol) => fetchAV({ function: 'GLOBAL_QUOTE', symbol });
const fxRate = (fromCurrency, toCurrency) =>
  fetchAV({
    function: 'CURRENCY_EXCHANGE_RATE',
    from_currency: fromCurrency,
    to_currency: toCurrency
  });
const digitalDaily = (symbol, market = 'USD') => fetchAV({ function: 'DIGITAL_CURRENCY_DAILY', symbol, market });

module.exports = { commodity, overview, globalQuote, fxRate, digitalDaily };
