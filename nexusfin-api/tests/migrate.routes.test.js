const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const mockConnect = jest.fn();

jest.mock('../src/config/db', () => ({
  pool: {
    connect: mockConnect
  }
}));

const migrateRoutes = require('../src/routes/migrate');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.use('/api/migrate', migrateRoutes);
  app.use(errorHandler);
  return app;
};

describe('migrate routes', () => {
  beforeEach(() => {
    mockConnect.mockReset();
  });

  it('returns 409 when user already has config data in backend', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ positions_count: '0', watchlist_count: '0', config_count: '1' }] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn()
    };

    mockConnect.mockResolvedValueOnce(client);

    const app = makeApp();
    const res = await request(app).post('/api/migrate').send({ positions: [], watchlist: [], config: { riskProfile: 'moderado' } });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MIGRATED');
    expect(client.query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
  });

  it('migrates payload when backend has no prior data', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ positions_count: '0', watchlist_count: '0', config_count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn()
    };

    mockConnect.mockResolvedValueOnce(client);

    const app = makeApp();
    const res = await request(app)
      .post('/api/migrate')
      .send({
        positions: [{ symbol: 'AAPL', buyDate: '2026-02-13', buyPrice: 100, quantity: 1 }],
        watchlist: [{ symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', category: 'equity' }],
        config: { riskProfile: 'moderado' }
      });

    expect(res.status).toBe(200);
    expect(res.body.migratedPositions).toBe(1);
    expect(res.body.migratedWatchlist).toBe(1);
    expect(res.body.migratedConfig).toBe(true);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('counts only unique watchlist inserts when duplicates are present', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ positions_count: '0', watchlist_count: '0', config_count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn()
    };

    mockConnect.mockResolvedValueOnce(client);

    const app = makeApp();
    const res = await request(app)
      .post('/api/migrate')
      .send({
        positions: [],
        watchlist: [
          { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', category: 'equity' },
          { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', category: 'equity' }
        ],
        config: null
      });

    expect(res.status).toBe(200);
    expect(res.body.migratedPositions).toBe(0);
    expect(res.body.migratedWatchlist).toBe(1);
    expect(res.body.migratedConfig).toBe(false);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });
});
