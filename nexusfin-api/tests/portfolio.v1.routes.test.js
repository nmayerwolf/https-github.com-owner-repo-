const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const routes = require('../src/routes/portfolio');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (locals = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1' };
    next();
  });
  app.locals = { ...app.locals, ...locals };
  app.use('/api/portfolio', routes);
  app.use(errorHandler);
  return app;
};

describe('portfolio routes v1', () => {
  test('GET / returns snapshot', async () => {
    const app = makeApp({
      portfolioEngine: {
        getSnapshot: jest.fn(async () => ({ portfolioId: 'p1', positions: [], exposures: [] }))
      }
    });
    const res = await request(app).get('/api/portfolio');
    expect(res.status).toBe(200);
    expect(res.body.portfolioId).toBe('p1');
  });

  test('POST /holdings validates payload', async () => {
    const app = makeApp({ portfolioEngine: { upsertHoldings: jest.fn() } });
    const res = await request(app).post('/api/portfolio/holdings').send({ holdings: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('GET /challenges returns list', async () => {
    const app = makeApp({
      portfolioEngine: {
        getChallenges: jest.fn(async () => [{ challengeId: 'c1', severity: 'WARN' }])
      }
    });
    const res = await request(app).get('/api/portfolio/challenges');
    expect(res.status).toBe(200);
    expect(res.body.challenges).toHaveLength(1);
  });
});
