const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const routes = require('../src/routes/packages');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (locals = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1' };
    next();
  });
  app.locals = { ...app.locals, ...locals };
  app.use('/api/packages', routes);
  app.use(errorHandler);
  return app;
};

describe('packages routes v1', () => {
  test('GET /today returns 503 without pipeline', async () => {
    const res = await request(makeApp()).get('/api/packages/today');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  test('GET /today returns package payload', async () => {
    const app = makeApp({
      ideasDailyPipeline: {
        generateDailyPackage: jest.fn(async () => ({ date: '2026-02-23', themes: [] }))
      }
    });
    const res = await request(app).get('/api/packages/today');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-02-23');
  });

  test('GET /:date forwards date to pipeline', async () => {
    const generateDailyPackage = jest.fn(async ({ date }) => ({ date, themes: [] }));
    const app = makeApp({ ideasDailyPipeline: { generateDailyPackage } });
    const res = await request(app).get('/api/packages/2026-02-19');
    expect(res.status).toBe(200);
    expect(generateDailyPackage).toHaveBeenCalledWith({ date: '2026-02-19', userId: 'u1' });
  });
});
