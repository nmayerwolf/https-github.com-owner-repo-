const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

const { query } = require('../src/config/db');
const configRoutes = require('../src/routes/config');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (userId = 'u1') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, email: 'user@mail.com' };
    next();
  });
  app.use('/api/config', configRoutes);
  app.use(errorHandler);
  return app;
};

describe('config routes', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('returns defaults for new user on GET', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).get('/api/config');

    expect(res.status).toBe(200);
    expect(res.body.riskProfile).toBe('moderado');
    expect(res.body.horizon).toBe('mediano');
  });

  it('rejects invalid riskProfile on PUT', async () => {
    const app = makeApp();
    const res = await request(app).put('/api/config').send({ riskProfile: 'invalid' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid sectors payload on PUT', async () => {
    const app = makeApp();
    const res = await request(app).put('/api/config').send({ sectors: ['tech', 'unknown'] });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('merges partial update on PUT', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'u1',
            risk_profile: 'agresivo',
            horizon: 'mediano',
            sectors: ['tech'],
            max_pe: 50,
            min_div_yield: 0,
            min_mkt_cap: 100,
            rsi_os: 30,
            rsi_ob: 70,
            vol_thresh: 2,
            min_confluence: 2
          }
        ]
      });

    const app = makeApp();
    const res = await request(app).put('/api/config').send({ riskProfile: 'agresivo', sectors: ['tech'] });

    expect(res.status).toBe(200);
    expect(res.body.riskProfile).toBe('agresivo');
    expect(res.body.sectors).toEqual(['tech']);
  });
});
