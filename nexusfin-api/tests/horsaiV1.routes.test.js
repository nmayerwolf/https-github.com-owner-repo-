const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const routes = require('../src/routes/horsaiV1');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.use('/api', routes);
  app.use(errorHandler);
  return app;
};

describe('horsai v1 routes', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('lists ideas with status filter', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'i1', status: 'ACTIVE', title: 'Idea 1', change_log: [] }] });
    const res = await request(makeApp()).get('/api/ideas?status=ACTIVE');

    expect(res.status).toBe(200);
    expect(res.body.ideas).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM horsai_ideas'), ['u1', 'ACTIVE']);
  });

  it('analyzes prompt and creates active idea when conviction >= 3', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'created-idea', title: 'Idea on AAPL', status: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp()).post('/api/ideas/analyze').send({ prompt: 'AAPL has 2 numbers: rev +15% and EPS +10%, next earnings in Mar 2026' });

    expect(res.status).toBe(201);
    expect(res.body.response.qualifies_as_active_idea).toBe('YES');
    expect(res.body.createdIdea.id).toBe('created-idea');
  });

  it('returns validation error on invalid status filter', async () => {
    const res = await request(makeApp()).get('/api/ideas?status=foo');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
