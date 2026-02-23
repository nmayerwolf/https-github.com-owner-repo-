const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const routes = require('../src/routes/brief');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (locals = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1' };
    next();
  });
  app.locals = { ...app.locals, ...locals };
  app.use('/api/brief', routes);
  app.use(errorHandler);
  return app;
};

describe('brief routes v1', () => {
  test('GET /today returns 503 without service', async () => {
    const res = await request(makeApp()).get('/api/brief/today');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  test('GET /today returns generated brief', async () => {
    const app = makeApp({
      briefGenerator: {
        getBrief: jest.fn(async () => ({ date: '2026-02-23', mainParagraph: 'brief ok', bullets: [] }))
      }
    });
    const res = await request(app).get('/api/brief/today');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-02-23');
  });

  test('GET /:date forwards date param', async () => {
    const getBrief = jest.fn(async ({ date }) => ({ date }));
    const app = makeApp({ briefGenerator: { getBrief } });
    const res = await request(app).get('/api/brief/2026-02-20');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-02-20');
    expect(getBrief).toHaveBeenCalledWith({ date: '2026-02-20' });
  });
});
