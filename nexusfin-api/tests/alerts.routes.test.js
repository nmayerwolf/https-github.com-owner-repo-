const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const alertsRoutes = require('../src/routes/alerts');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (userId = 'u1') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, email: 'user@mail.com' };
    next();
  });
  app.use('/api/alerts', alertsRoutes);
  app.use(errorHandler);
  return app;
};

describe('alerts routes', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('returns paginated alerts with stats', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            symbol: 'NVDA',
            name: 'NVIDIA',
            type: 'opportunity',
            recommendation: 'STRONG BUY',
            confidence: 'high',
            confluence_bull: 5,
            confluence_bear: 1,
            signals: [{ indicator: 'RSI' }],
            price_at_alert: '118.20',
            stop_loss: '108.50',
            take_profit: '142.30',
            outcome: 'open',
            ai_thesis: null,
            notified: true,
            created_at: '2026-02-13T00:00:00.000Z'
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 1, opportunities: 1, bearish: 0, stop_loss: 0, wins: 0, losses: 0, avg_return: null }] });

    const app = makeApp();
    const res = await request(app).get('/api/alerts?page=1&limit=20');

    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].symbol).toBe('NVDA');
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.stats.total).toBe(1);
    expect(res.body.stats.hitRate).toBe(0);
  });

  it('returns 404 on missing alert detail', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).get('/api/alerts/missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('ALERT_NOT_FOUND');
  });

  it('shares alert to group when membership exists', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'a1', symbol: 'NVDA', recommendation: 'STRONG BUY', price_at_alert: '118.20' }] })
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] })
      .mockResolvedValueOnce({ rows: [{ shared_at: '2026-02-13T01:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).post('/api/alerts/a1/share').send({ groupId: 'g1' });

    expect(res.status).toBe(200);
    expect(res.body.shared).toBe(true);
  });

  it('returns 409 when alert is already shared to group', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'a1', symbol: 'NVDA', recommendation: 'STRONG BUY', price_at_alert: '118.20' }] })
      .mockResolvedValueOnce({ rows: [{ role: 'member' }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).post('/api/alerts/a1/share').send({ groupId: 'g1' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_SHARED');
  });
});
