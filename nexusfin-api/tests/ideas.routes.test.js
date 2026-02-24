const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const routes = require('../src/routes/ideas');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (locals = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1' };
    next();
  });
  app.locals = { ...app.locals, ...locals };
  app.use('/api/ideas', routes);
  app.use(errorHandler);
  return app;
};

describe('ideas routes v1', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('GET / returns ideas list', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'i1', title: 'Idea 1' }] });
    const res = await request(makeApp()).get('/api/ideas');
    expect(res.status).toBe(200);
    expect(res.body.ideas).toHaveLength(1);
  });

  test('POST /analyze validates prompt', async () => {
    const res = await request(makeApp()).post('/api/ideas/analyze').send({ prompt: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /analyze returns pipeline output', async () => {
    const app = makeApp({
      ideasDailyPipeline: {
        analyzePrompt: jest.fn(async () => ({ message: 'Qualifies as Active Idea: YES' }))
      }
    });

    const res = await request(app).post('/api/ideas/analyze').send({ prompt: 'Analizar NVDA' });
    expect(res.status).toBe(201);
    expect(res.body.message).toContain('YES');
  });

  test('POST /:id/review uses pipeline', async () => {
    const app = makeApp({
      ideasDailyPipeline: {
        reviewIdeas: jest.fn(async () => ({ reviewed: 3, published: 1 }))
      }
    });

    const res = await request(app).post('/api/ideas/abc/review').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.review.reviewed).toBe(3);
  });
});
