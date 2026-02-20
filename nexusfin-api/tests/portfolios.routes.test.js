const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const routes = require('../src/routes/portfolios');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.use('/api/portfolios', routes);
  app.use(errorHandler);
  return app;
};

describe('portfolios v2 routes', () => {
  beforeEach(() => query.mockReset());

  it('creates portfolio honoring limit', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Core', currency: 'USD', created_at: '2026-02-20T00:00:00.000Z' }] });

    const res = await request(makeApp()).post('/api/portfolios').send({ name: 'Core', currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('owner');
    expect(res.body.name).toBe('Core');
  });

  it('rejects holdings replacement above max', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', role: 'owner', name: 'Core', currency: 'USD' }] });

    const holdings = Array.from({ length: 16 }, (_, i) => ({ symbol: `S${i}`, qty: 1, avg_cost: 10 }));
    const res = await request(makeApp())
      .put('/api/portfolios/11111111-1111-4111-8111-111111111111/holdings')
      .send({ holdings });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('HOLDING_LIMIT_REACHED');
  });
});
