const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const routes = require('../src/routes/newsDigest');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.use('/api/news/digest', routes);
  app.use(errorHandler);
  return app;
};

describe('news digest routes', () => {
  beforeEach(() => query.mockReset());

  it('returns contract payload for date', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            bullets: ['a', 'b'],
            themes: ['mega_cap_tech'],
            risk_flags: ['vol_up'],
            raw_structured: { key_risks: ['vol_up'], macro_drivers: ['soft landing'] }
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            regime: 'risk_on',
            volatility_regime: 'normal',
            leadership: ['mega_cap_tech'],
            macro_drivers: ['soft landing'],
            risk_flags: ['vol_up'],
            confidence: '0.72'
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ is_active: false, triggers: [], summary: 'ok', learn_more: {} }] });

    const res = await request(makeApp()).get('/api/news/digest/2026-02-20');

    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-02-20');
    expect(Array.isArray(res.body.bullets)).toBe(true);
    expect(res.body.regime).toBe('risk_on');
    expect(res.body.regime_label).toBe('Supportive');
  });

  it('returns pending when digest is missing', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            regime: 'risk_off',
            volatility_regime: 'elevated',
            leadership: ['defensives'],
            macro_drivers: ['growth slowdown'],
            risk_flags: ['credit stress', 'vol_up'],
            confidence: '0.66'
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ is_active: true, triggers: ['volatility_regime=elevated'], summary: 'alert', learn_more: {} }] });

    const res = await request(makeApp()).get('/api/news/digest/2026-02-20');

    expect(res.status).toBe(200);
    expect(res.body.pending).toBe(true);
  });
});
