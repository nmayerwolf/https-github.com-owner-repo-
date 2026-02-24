const { env } = require('../config/env');
const { withTimeout, ensureOk } = require('./httpClient');

const BASE_URL = 'https://financialmodelingprep.com';

const toNum = (value, fallback = null) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const isoOrNow = (value) => {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? new Date(ts).toISOString() : new Date().toISOString();
};

const createFmpAdapter = ({
  apiKey = env.fmpApiKey,
  fetchImpl = global.fetch,
  baseUrl = BASE_URL,
  timeoutMs = env.externalFetchTimeoutMs
} = {}) => {
  const request = async (path, params = {}) => {
    if (!apiKey) throw new Error('Missing FMP_API_KEY');
    if (!fetchImpl) throw new Error('Missing fetch implementation');

    const qs = new URLSearchParams({ ...params, apikey: apiKey });
    const url = `${baseUrl}${path}?${qs.toString()}`;
    const res = await withTimeout(fetchImpl, url, {}, timeoutMs);
    await ensureOk(res, `FMP ${path}`);
    return res.json();
  };

  const requestWithFallback = async (paths, params = {}) => {
    let lastError = null;
    for (const path of paths) {
      try {
        return await request(path, params);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('FMP request failed');
  };

  return {
    vendor: 'fmp',

    async getFundamentals(asset) {
      const symbol = String(asset?.symbol || '').trim();
      const [profile, income, balance] = await Promise.all([
        requestWithFallback(['/stable/profile', `/api/v3/profile/${encodeURIComponent(symbol)}`], { symbol }),
        requestWithFallback(['/stable/income-statement', `/api/v3/income-statement/${encodeURIComponent(symbol)}`], { symbol, limit: '4' }),
        requestWithFallback(['/stable/balance-sheet-statement', `/api/v3/balance-sheet-statement/${encodeURIComponent(symbol)}`], { symbol, limit: '1' })
      ]);

      const p = Array.isArray(profile) ? profile[0] || {} : {};
      const i = Array.isArray(income) ? income[0] || {} : {};
      const b = Array.isArray(balance) ? balance[0] || {} : {};

      const revenue = toNum(i.revenue, null);
      const grossProfit = toNum(i.grossProfit, null);
      const operatingIncome = toNum(i.operatingIncome, null);
      const netIncome = toNum(i.netIncome, null);
      const ebitda = toNum(i.ebitda, null);
      const totalDebt = toNum(b.totalDebt, null);
      const cash = toNum(b.cashAndCashEquivalents, null);

      return {
        asset,
        asOf: isoOrNow(i.date || p.lastDiv || b.date),
        currency: 'USD',
        marketCap: toNum(p.mktCap, null),
        revenueTTM: revenue,
        grossMarginTTM: revenue ? (grossProfit != null ? grossProfit / revenue : null) : null,
        operatingMarginTTM: revenue ? (operatingIncome != null ? operatingIncome / revenue : null) : null,
        netMarginTTM: revenue ? (netIncome != null ? netIncome / revenue : null) : null,
        fcfTTM: toNum(i.freeCashFlow, null),
        netDebt: totalDebt != null && cash != null ? totalDebt - cash : null,
        debtToEbitda: totalDebt != null && ebitda ? totalDebt / ebitda : null,
        peTTM: toNum(p.pe, null),
        evToEbitdaTTM: toNum(p.enterpriseValueOverEBITDA, null),
        priceToSalesTTM: toNum(p.priceToSalesRatioTTM, null),
        raw: { profile: p, income: i, balance: b },
        sources: [{ vendor: 'fmp', vendorSymbol: symbol }]
      };
    },

    async getEarningsCalendar(range) {
      const out = await requestWithFallback(['/stable/earnings-calendar', '/api/v3/earning_calendar'], {
        from: range.from,
        to: range.to
      });
      const rows = Array.isArray(out) ? out : [];
      return rows
        .filter((row) => row?.symbol)
        .map((row) => ({
          asset: {
            symbol: String(row.symbol),
            assetClass: 'equity'
          },
          fiscalPeriod: row?.fiscalDateEnding ? String(row.fiscalDateEnding) : undefined,
          reportDate: isoOrNow(row?.date),
          timeOfDay: 'UNKNOWN',
          epsEstimate: toNum(row?.epsEstimated, null),
          revenueEstimate: toNum(row?.revenueEstimated, null),
          sources: [{ vendor: 'fmp', vendorSymbol: String(row.symbol) }]
        }));
    }
  };
};

module.exports = { createFmpAdapter };
