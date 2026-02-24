const { env } = require('../config/env');
const { withTimeout, ensureOk } = require('./httpClient');

const BASE_URL = 'https://api.polygon.io';

const isoOrNow = (value) => {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? new Date(ts).toISOString() : new Date().toISOString();
};

const toNum = (value, fallback = null) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const vendorSymbolFor = (asset) => {
  if (!asset || !asset.symbol) return '';
  if (asset.assetClass === 'crypto' && !String(asset.symbol).startsWith('X:')) return `X:${asset.symbol}`;
  if (asset.assetClass === 'fx' && !String(asset.symbol).startsWith('C:')) return `C:${asset.symbol}`;
  return String(asset.symbol);
};

const createPolygonAdapter = ({
  apiKey = env.polygonApiKey,
  fetchImpl = global.fetch,
  baseUrl = BASE_URL,
  timeoutMs = env.externalFetchTimeoutMs
} = {}) => {
  const request = async (path, params = {}) => {
    if (!apiKey) throw new Error('Missing POLYGON_API_KEY');
    if (!fetchImpl) throw new Error('Missing fetch implementation');

    const qs = new URLSearchParams({ ...params, apiKey });
    const url = `${baseUrl}${path}?${qs.toString()}`;
    const res = await withTimeout(fetchImpl, url, {}, timeoutMs);
    await ensureOk(res, `Polygon ${path}`);
    return res.json();
  };

  return {
    vendor: 'polygon',

    async getSnapshot(asset) {
      const symbol = vendorSymbolFor(asset);
      const payload = await request(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}`);
      const ticker = payload?.ticker || {};
      const day = ticker?.day || {};
      const prev = ticker?.prevDay || {};
      const min = ticker?.min || {};

      const dayClose = toNum(day.c, null);
      const minClose = toNum(min.c, null);
      const prevClose = toNum(prev.c, null);
      const last = [dayClose, minClose, prevClose].find((value) => value != null && value > 0) ?? null;
      if (last == null || last <= 0) {
        throw new Error(`Invalid snapshot last for ${symbol}`);
      }
      const changeAbs = prevClose != null ? last - prevClose : null;
      const changePct = prevClose && prevClose > 0 ? (changeAbs / prevClose) * 100 : null;

      return {
        asset,
        ts: isoOrNow(ticker?.updated || min?.t),
        last,
        changeAbs,
        changePct,
        dayHigh: toNum(day.h, null),
        dayLow: toNum(day.l, null),
        volume: toNum(day.v, null),
        currency: 'USD',
        sources: [{ vendor: 'polygon', vendorSymbol: symbol }]
      };
    },

    async getBars(asset, range) {
      const symbol = vendorSymbolFor(asset);
      const [multiplier, timespan] = range.interval === '1h' ? [1, 'hour'] : range.interval === '5m' ? [5, 'minute'] : [1, 'day'];
      const payload = await request(
        `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${multiplier}/${timespan}/${range.from}/${range.to}`,
        { adjusted: 'true', sort: 'asc', limit: '5000' }
      );

      const results = Array.isArray(payload?.results) ? payload.results : [];
      return results
        .map((row) => ({
          asset,
          ts: isoOrNow(row?.t),
          open: toNum(row?.o, null),
          high: toNum(row?.h, null),
          low: toNum(row?.l, null),
          close: toNum(row?.c, null),
          volume: toNum(row?.v, null),
          currency: 'USD',
          sources: [{ vendor: 'polygon', vendorSymbol: symbol }]
        }))
        .filter((bar) => bar.open != null && bar.high != null && bar.low != null && bar.close != null && bar.close > 0);
    }
  };
};

module.exports = { createPolygonAdapter };
