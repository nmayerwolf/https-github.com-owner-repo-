const { env } = require('../config/env');

const BASE = 'https://finnhub.io/api/v1';

const fetchFinnhub = async (path, params = {}) => {
  const qs = new URLSearchParams({ ...params, token: env.finnhubKey });
  const res = await fetch(`${BASE}${path}?${qs}`);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  return res.json();
};

const quote = (symbol) => fetchFinnhub('/quote', { symbol });
const candles = (symbol, resolution, from, to) => fetchFinnhub('/stock/candle', { symbol, resolution, from, to });
const cryptoCandles = (symbol, resolution, from, to) => fetchFinnhub('/crypto/candle', { symbol: `BINANCE:${symbol}`, resolution, from, to });
const forexCandles = (from, to, resolution, tsFrom, tsTo) =>
  fetchFinnhub('/forex/candle', { symbol: `OANDA:${from}_${to}`, resolution, from: tsFrom, to: tsTo });
const profile = (symbol) => fetchFinnhub('/stock/profile2', { symbol });

module.exports = { quote, candles, cryptoCandles, forexCandles, profile };
