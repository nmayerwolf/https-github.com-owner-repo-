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
  overview: jest.fn()
}));

const finnhub = require('../src/services/finnhub');
const av = require('../src/services/alphavantage');
const { cache } = require('../src/config/cache');
const marketRoutes = require('../src/routes/market');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.use('/api/market', marketRoutes);
  app.use(errorHandler);
  return app;
};

describe('market routes', () => {
  beforeEach(() => {
    cache.flushAll();
    jest.clearAllMocks();
  });

  it('returns 422 when quote symbol is missing', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/market/quote');

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('caches candles response for same params', async () => {
    finnhub.candles.mockResolvedValue({ c: [1, 2, 3], s: 'ok' });

    const app = makeApp();

    const path = '/api/market/candles?symbol=AAPL&resolution=D&from=1700000000&to=1701000000';
    const first = await request(app).get(path);
    const second = await request(app).get(path);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(finnhub.candles).toHaveBeenCalledTimes(1);
  });

  it('caches profile response and merges finnhub+overview fields', async () => {
    finnhub.profile.mockResolvedValue({ name: 'Apple Inc.', finnhubIndustry: 'Technology', marketCapitalization: 3500 });
    av.overview.mockResolvedValue({ PERatio: '30.5', DividendYield: '0.5' });

    const app = makeApp();

    const first = await request(app).get('/api/market/profile?symbol=AAPL');
    const second = await request(app).get('/api/market/profile?symbol=AAPL');

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      name: 'Apple Inc.',
      sector: 'Technology',
      marketCap: 3500,
      pe: '30.5',
      dividendYield: '0.5'
    });
    expect(second.status).toBe(200);
    expect(finnhub.profile).toHaveBeenCalledTimes(1);
    expect(av.overview).toHaveBeenCalledTimes(1);
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
    finnhub.symbolSearch.mockResolvedValueOnce({
      result: [{ symbol: 'NSRGY', description: 'Nestle SA ADR', type: 'Common Stock' }]
    });

    const app = makeApp();
    const res = await request(app).get('/api/market/search?q=nestle');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.some((item) => item.symbol === 'NSRGY')).toBe(true);
  });

  it('ranks market search results by relevance', async () => {
    finnhub.symbolSearch.mockResolvedValueOnce({
      result: [
        { symbol: 'NESTL.ZZ', description: 'Nestle Placeholder Right', type: 'Right' },
        { symbol: 'NSRGY', description: 'Nestle SA ADR', type: 'ADR' }
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
    expect(finnhub.symbolSearch).not.toHaveBeenCalled();
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
    expect(res.body.items[0]).toEqual(expect.objectContaining({ id: 103 }));
    expect(res.body.items.every((item) => Number(item.aiScore) >= 6)).toBe(true);
    expect(finnhub.generalNews).toHaveBeenCalledWith('general', 0);
    expect(finnhub.companyNews).toHaveBeenCalledWith('AAPL', expect.any(String), expect.any(String));
  });

  it('returns bulk snapshot with successes and per-symbol errors', async () => {
    finnhub.quote.mockImplementation(async (symbol) => {
      if (symbol === 'MSFT') throw new Error('unexpected failure');
      return { c: 120, pc: 100, dp: 20 };
    });

    const app = makeApp();
    const res = await request(app).get('/api/market/snapshot?symbols=AAPL,MSFT,BTCUSDT');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.count).toBe(2);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.map((x) => x.symbol)).toEqual(expect.arrayContaining(['AAPL', 'BTCUSDT']));
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ symbol: 'MSFT', code: 'SNAPSHOT_FAILED' })]));
  });
});
