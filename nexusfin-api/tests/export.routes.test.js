const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

const { query } = require('../src/config/db');
const exportRoutes = require('../src/routes/export');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (userId = 'u1') => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.user = { id: userId, email: 'user@mail.com' };
    next();
  });
  app.use('/api/export', exportRoutes);
  app.use(errorHandler);
  return app;
};

describe('export routes', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('returns FEATURE_REMOVED for portfolio csv export endpoint', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/export/portfolio?format=csv&filter=all');

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('FEATURE_REMOVED');
  });

  it('returns 400 for unsupported pdf format', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/export/alert/a1?format=txt');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when alert does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).get('/api/export/alert/a1?format=pdf');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ALERT_NOT_FOUND');
  });

  it('exports alert report as PDF', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'a1',
          symbol: 'NVDA',
          name: 'NVIDIA Corp',
          type: 'opportunity',
          recommendation: 'STRONG BUY',
          confidence: 'high',
          confluence_bull: 5,
          confluence_bear: 1,
          signals: [],
          price_at_alert: '118.2',
          stop_loss: '108.5',
          take_profit: '142.3',
          ai_thesis: { summary: 'Momentum favorable con catalizadores cercanos.' },
          snapshot: { rsi: 28.3, atr: 4.2 },
          created_at: '2026-02-10T14:30:00.000Z'
        }
      ]
    });

    const app = makeApp();
    const res = await request(app).get('/api/export/alert/a1?format=pdf');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment; filename="horsai-alert-NVDA-');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.toString('utf8', 0, 4)).toBe('%PDF');
  });

  it('exports alert report as PDF via POST', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'a1',
          symbol: 'NVDA',
          name: 'NVIDIA Corp',
          type: 'opportunity',
          recommendation: 'STRONG BUY',
          confidence: 'high',
          confluence_bull: 5,
          confluence_bear: 1,
          signals: [],
          price_at_alert: '118.2',
          stop_loss: '108.5',
          take_profit: '142.3',
          ai_thesis: { summary: 'Momentum favorable con catalizadores cercanos.' },
          snapshot: { rsi: 28.3, atr: 4.2 },
          created_at: '2026-02-10T14:30:00.000Z'
        }
      ]
    });

    const app = makeApp();
    const res = await request(app).post('/api/export/alert/a1?format=pdf').send({ reason: 'manual-export' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.toString('utf8', 0, 4)).toBe('%PDF');
  });
});
