const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/services/finnhub', () => ({
  quote: jest.fn(),
  candles: jest.fn(),
  cryptoCandles: jest.fn(),
  forexCandles: jest.fn(),
  profile: jest.fn(),
  symbolSearch: jest.fn(),
  companyNews: jest.fn(),
  generalNews: jest.fn()
}));

jest.mock('../src/services/alphavantage', () => ({
  commodity: jest.fn(),
  overview: jest.fn(),
  globalQuote: jest.fn(),
  fxRate: jest.fn(),
  digitalDaily: jest.fn()
}));

jest.mock('../src/services/twelvedata', () => ({
  hasKey: jest.fn(() => true),
  quote: jest.fn(),
  symbolSearch: jest.fn(),
  timeSeries: jest.fn()
}));

const finnhub = require('../src/services/finnhub');
const av = require('../src/services/alphavantage');
const twelvedata = require('../src/services/twelvedata');
const { cache } = require('../src/config/cache');
const marketRoutes = require('../src/routes/market');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: '00000000-0000-4000-8000-000000000001', email: 'user@mail.com' };
    next();
  });
  app.use('/api/market', marketRoutes);
  app.use(errorHandler);
  return app;
};

describe('market routes', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    cache.flushAll();
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns 422 when quote symbol is missing', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/market/quote');

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('caches candles response for same params', async () => {
    twelvedata.timeSeries.mockResolvedValue({
      values: [
        { datetime: '2026-02-18', close: '10', high: '11', low: '9', volume: '1000' },
        { datetime: '2026-02-19', close: '11', high: '12', low: '10', volume: '1200' }
      ]
    });

    const app = makeApp();

    const path = '/api/market/candles?symbol=AAPL&resolution=D&from=1700000000&to=1701000000';
    const first = await request(app).get(path);
    const second = await request(app).get(path);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(twelvedata.timeSeries).toHaveBeenCalledTimes(1);
  });

  it('returns profile data from market universe fallback', async () => {
    const app = makeApp();

    const first = await request(app).get('/api/market/profile?symbol=AAPL');
    const second = await request(app).get('/api/market/profile?symbol=AAPL');

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      name: 'Apple',
      sector: 'equity',
      marketCap: null,
      pe: null,
      dividendYield: null
    });
    expect(second.status).toBe(200);
  });

  it('returns realtime universe with categories and count', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/market/universe');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.assets)).toBe(true);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(typeof res.body.count).toBe('number');
    expect(res.body.count).toBeGreaterThan(20);
    expect(res.body.categories).toContain('equity');
    expect(res.body.categories).toContain('etf');
    expect(res.body.categories).toContain('bond');
    expect(res.body.categories).toContain('commodity');
    expect(res.body.categories).toContain('metal');
    expect(res.body.categories).toContain('crypto');
    expect(res.body.categories).toContain('fx');
  });

  it('returns market search results merged from universe and provider', async () => {
    twelvedata.symbolSearch.mockResolvedValueOnce({
      data: [{ symbol: 'NSRGY', instrument_name: 'Nestle SA ADR', instrument_type: 'Common Stock' }]
    });

    const app = makeApp();
    const res = await request(app).get('/api/market/search?q=nestle');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.some((item) => item.symbol === 'NSRGY')).toBe(true);
  });

  it('ranks market search results by relevance', async () => {
    twelvedata.symbolSearch.mockResolvedValueOnce({
      data: [
        { symbol: 'NESTL.ZZ', instrument_name: 'Nestle Placeholder Right', instrument_type: 'Right' },
        { symbol: 'NSRGY', instrument_name: 'Nestle SA ADR', instrument_type: 'ADR' }
      ]
    });

    const app = makeApp();
    const res = await request(app).get('/api/market/search?q=nestle');

    expect(res.status).toBe(200);
    expect(res.body.items[0].symbol).toBe('NSRGY');
  });

  it('returns empty market search when query is too short', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/market/search?q=n');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(twelvedata.symbolSearch).not.toHaveBeenCalled();
  });

  it('returns proxied company news list', async () => {
    finnhub.companyNews.mockResolvedValueOnce([{ id: 1, headline: 'NVIDIA launches product', url: 'https://example.com/nvda' }]);
    const app = makeApp();
    const res = await request(app).get('/api/market/news?symbol=NVDA&from=2026-02-01&to=2026-02-14');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(finnhub.companyNews).toHaveBeenCalledWith('NVDA', '2026-02-01', '2026-02-14');
  });

  it('returns proxied general news list', async () => {
    finnhub.generalNews.mockResolvedValueOnce([{ id: 2, headline: 'Market opens mixed', url: 'https://example.com/general' }]);
    const app = makeApp();
    const res = await request(app).get('/api/market/news?category=general&minId=0');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(finnhub.generalNews).toHaveBeenCalledWith('general', 0);
  });

  it('returns AI recommended market news ranked by recency with score filter', async () => {
    const now = Math.floor(Date.now() / 1000);
    finnhub.generalNews.mockResolvedValueOnce([
      {
        id: 101,
        headline: 'Fed warns on inflation outlook',
        summary: 'Policy update with macro impact',
        related: '',
        datetime: now - 120
      },
      {
        id: 102,
        headline: 'Minor local event',
        summary: 'Low impact',
        related: '',
        datetime: now - 60
      }
    ]);
    finnhub.companyNews.mockResolvedValueOnce([
      {
        id: 103,
        headline: 'AAPL announces major launch',
        summary: 'Product launch expected to affect growth guidance',
        related: 'AAPL',
        datetime: now - 30
      }
    ]);

    const app = makeApp();
    const res = await request(app).get('/api/market/news/recommended?symbols=AAPL&minScore=6&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ai');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.map((item) => item.id)).toEqual(expect.arrayContaining([101, 103]));
    expect(res.body.items.every((item) => Number(item.aiScore) >= 6)).toBe(true);
    expect(finnhub.generalNews).toHaveBeenCalledWith('general', 0);
    expect(finnhub.companyNews).toHaveBeenCalledWith('AAPL', expect.any(String), expect.any(String));
  });

  it('returns bulk snapshot with successes and per-symbol errors', async () => {
    twelvedata.quote.mockImplementation(async (symbol) => {
      if (symbol === 'MSFT') throw new Error('unexpected failure');
      return { close: 120, previous_close: 100, percent_change: 20 };
    });
    twelvedata.timeSeries.mockResolvedValue({
      values: [{ datetime: '2026-02-19', close: '120', high: '121', low: '119', volume: '1000' }]
    });

    const app = makeApp();
    const res = await request(app).get('/api/market/snapshot?symbols=AAPL,MSFT,BTCUSDT');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.count).toBe(3);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.map((x) => x.symbol)).toEqual(expect.arrayContaining(['AAPL', 'BTCUSDT']));
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ symbol: 'MSFT', code: 'NO_LIVE_DATA' })]));
  });

  it('returns per-symbol NO_LIVE_DATA errors when single source has no quote', async () => {
    twelvedata.quote.mockRejectedValueOnce(new Error('upstream unavailable'));

    const app = makeApp();
    const res = await request(app).get('/api/market/snapshot?symbols=AAPL');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ symbol: 'AAPL', code: 'NO_LIVE_DATA' })]));
  });

  it('stores and summarizes news telemetry per user', async () => {
    const app = makeApp();

    const postImpressions = await request(app).post('/api/market/news/telemetry').send({
      eventType: 'impression',
      items: [
        { id: 'r1', aiTheme: 'macro', aiScore: 18, headline: 'Fed update' },
        { id: 'r2', aiTheme: 'crypto', aiScore: 12, headline: 'BTC regulation' }
      ]
    });
    expect(postImpressions.status).toBe(201);
    expect(postImpressions.body.ok).toBe(true);

    const postClick = await request(app).post('/api/market/news/telemetry').send({
      eventType: 'click',
      items: [{ id: 'r1', aiTheme: 'macro', aiScore: 18, headline: 'Fed update' }]
    });
    expect(postClick.status).toBe(201);
    expect(postClick.body.ok).toBe(true);

    const summary = await request(app).get('/api/market/news/telemetry/summary?days=7');
    expect(summary.status).toBe(200);
    if (summary.body.persisted === false) {
      expect(Number(summary.body.impressions || 0)).toBe(0);
      expect(Number(summary.body.clicks || 0)).toBe(0);
    } else {
      expect(Number(summary.body.impressions || 0)).toBeGreaterThanOrEqual(2);
      expect(Number(summary.body.clicks || 0)).toBeGreaterThanOrEqual(1);
    }
    expect(Array.isArray(summary.body.byTheme)).toBe(true);

    const reset = await request(app).delete('/api/market/news/telemetry/summary');
    expect(reset.status).toBe(200);
    expect(reset.body.ok).toBe(true);
  });
});
