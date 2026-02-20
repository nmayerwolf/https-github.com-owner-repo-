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

  it('rejects add symbol when user reached 15 symbols', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: 15 }] });

    const app = makeApp();
    const res = await request(app).post('/api/watchlist').send({
      symbol: 'AMD',
      name: 'AMD Inc.',
      type: 'stock',
      category: 'equity'
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LIMIT_REACHED');
  });

  it('normalizes symbol to uppercase before insert', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ symbol: 'AMD', name: 'AMD Inc.', type: 'stock', category: 'equity', added_at: '2026-02-13' }] });

    const app = makeApp();
    const res = await request(app).post('/api/watchlist').send({
      symbol: 'amd',
      name: 'AMD Inc.',
      type: 'stock',
      category: 'equity'
    });

    expect(res.status).toBe(201);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO watchlist_items'),
      ['u1', 'AMD', 'AMD Inc.', 'stock', 'equity']
    );
  });

  it('accepts symbols with underscore and caret for broad market coverage', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ symbol: 'XAU_USD', name: 'Gold Spot', type: 'forex', category: 'metal', added_at: '2026-02-19' }] });

    const app = makeApp();
    const xau = await request(app).post('/api/watchlist').send({
      symbol: 'xau_usd',
      name: 'Gold Spot',
      type: 'forex',
      category: 'metal'
    });
    expect(xau.status).toBe(201);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO watchlist_items'),
      ['u1', 'XAU_USD', 'Gold Spot', 'forex', 'metal']
    );

    query.mockReset();
    query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ symbol: '^MERV', name: 'S&P Merval', type: 'stock', category: 'equity', added_at: '2026-02-19' }] });

    const merv = await request(app).post('/api/watchlist').send({
      symbol: '^merv',
      name: 'S&P Merval',
      type: 'stock',
      category: 'equity'
    });
    expect(merv.status).toBe(201);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO watchlist_items'),
      ['u1', '^MERV', 'S&P Merval', 'stock', 'equity']
    );
  });

  it('rejects invalid symbol format', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/watchlist').send({
      symbol: 'bad symbol!',
      name: 'Bad',
      type: 'stock',
      category: 'equity'
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
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
    expect(res.body.error.code).toBe('ALREADY_EXISTS');
  });

  it('normalizes symbol to uppercase on delete', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).delete('/api/watchlist/amd');

    expect(res.status).toBe(204);
    expect(query).toHaveBeenCalledWith('DELETE FROM watchlist_items WHERE user_id = $1 AND symbol = $2', ['u1', 'AMD']);
  });
});
