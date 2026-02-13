const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

const { query } = require('../src/config/db');
const watchlistRoutes = require('../src/routes/watchlist');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (userId = 'u1') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, email: 'user@mail.com' };
    next();
  });
  app.use('/api/watchlist', watchlistRoutes);
  app.use(errorHandler);
  return app;
};

describe('watchlist routes', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('rejects add symbol when user reached 50 symbols', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: 50 }] });

    const app = makeApp();
    const res = await request(app).post('/api/watchlist').send({
      symbol: 'AMD',
      name: 'AMD Inc.',
      type: 'stock',
      category: 'equity'
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('LIMIT_REACHED');
  });

  it('rejects duplicate symbol for same user', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).post('/api/watchlist').send({
      symbol: 'AMD',
      name: 'AMD Inc.',
      type: 'stock',
      category: 'equity'
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_EXISTS');
  });
});
