const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

const { query } = require('../src/config/db');
const portfolioRoutes = require('../src/routes/portfolio');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (userId = 'u1') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, email: 'user@mail.com' };
    next();
  });
  app.use('/api/portfolio', portfolioRoutes);
  app.use(errorHandler);
  return app;
};

describe('portfolio routes', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('rejects create when user reached 200 positions', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: 200 }] });

    const app = makeApp();
    const res = await request(app).post('/api/portfolio').send({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      category: 'equity',
      buyDate: '2026-02-13',
      buyPrice: 100,
      quantity: 1
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('LIMIT_REACHED');
  });

  it('rejects patch for already sold position', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'p1', sell_date: '2026-02-10', sell_price: 120, buy_price: 100, quantity: 1, notes: null }] });

    const app = makeApp();
    const res = await request(app).patch('/api/portfolio/p1').send({ buyPrice: 101 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('POSITION_SOLD');
  });

  it('rejects sell when sellDate or sellPrice is missing', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'p1', sell_date: null, sell_price: null, buy_price: 100, quantity: 1, notes: null }] });

    const app = makeApp();
    const res = await request(app).patch('/api/portfolio/p1').send({ sellDate: '2026-02-13' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
