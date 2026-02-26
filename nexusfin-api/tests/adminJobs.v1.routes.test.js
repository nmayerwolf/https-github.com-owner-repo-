const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: (...args) => mockQuery(...args) }));

const { env } = require('../src/config/env');
const routes = require('../src/routes/adminJobs');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (locals = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1' };
    next();
  });
  app.locals = { ...app.locals, ...locals };
  app.use('/api/admin/jobs', routes);
  app.use(errorHandler);
  return app;
};

describe('admin jobs routes v1', () => {
  const prevToken = env.adminJobToken;
  const prevTokenNext = env.adminJobTokenNext;
  const prevEnableFixes = env.adminEnableDataFixes;

  beforeEach(() => {
    env.adminJobToken = 'admin-secret';
    env.adminJobTokenNext = 'admin-secret-next';
    env.adminEnableDataFixes = false;
    mockQuery.mockReset();
  });

  afterAll(() => {
    env.adminJobToken = prevToken;
    env.adminJobTokenNext = prevTokenNext;
    env.adminEnableDataFixes = prevEnableFixes;
  });

  test('POST /run requires admin token', async () => {
    const res = await request(makeApp()).post('/api/admin/jobs/run').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ADMIN_JOBS');
  });

  test('POST /run executes v1 jobs', async () => {
    const ingestMarketSnapshots = jest.fn(async () => ({ ok: true }));
    const generateBrief = jest.fn(async () => ({ date: '2026-02-23' }));
    const reviewIdeas = jest.fn(async () => ({ reviewed: 2, published: 1 }));
    const app = makeApp({
      marketIngestionService: {
        ingestMarketSnapshots,
        ingestPriceBars: jest.fn(async () => ({ ok: true })),
        ingestFundamentals: jest.fn(async () => ({ ok: true })),
        ingestEarningsCalendar: jest.fn(async () => ({ ok: true })),
        ingestNews: jest.fn(async () => ({ ok: true })),
        ingestNewsBackfill: jest.fn(async () => ({ ok: true })),
        computeRelevanceScores: jest.fn(async () => ({ ok: true }))
      },
      briefGenerator: { generateBrief },
      ideasDailyPipeline: {
        reviewIdeas,
        generateDailyPackage: jest.fn(async () => ({ date: '2026-02-23' }))
      }
    });

    const res = await request(app).post('/api/admin/jobs/run').set('x-admin-token', 'admin-secret').send({ date: '2026-02-23' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.runId).toBe('string');
    expect(res.body.results.ingest_market_snapshots.ok).toBe(true);
    expect(res.body.results.ideasReview.reviewed).toBe(2);
    expect(ingestMarketSnapshots).toHaveBeenCalledWith({ date: '2026-02-23' });
    expect(generateBrief).toHaveBeenCalledWith({ runId: res.body.runId, date: '2026-02-23' });
    expect(reviewIdeas).toHaveBeenCalledWith({ runId: res.body.runId, runDate: '2026-02-23' });
  });

  test('GET /status returns cron snapshot', async () => {
    const app = makeApp({
      getCronStatus: () => ({ enabled: true, lastRun: '2026-02-23T09:30:00.000Z', errors: [] })
    });

    const res = await request(app).get('/api/admin/jobs/status').set('x-admin-token', 'admin-secret-next');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cron.enabled).toBe(true);
  });

  test('POST /fix/news-titles is disabled by flag by default', async () => {
    const res = await request(makeApp()).post('/api/admin/jobs/fix/news-titles').set('x-admin-token', 'admin-secret').send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DATA_FIX_DISABLED');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('POST /fix/news-titles runs when flag is enabled', async () => {
    env.adminEnableDataFixes = true;
    mockQuery.mockResolvedValueOnce({ rowCount: 12 });
    const res = await request(makeApp()).post('/api/admin/jobs/fix/news-titles').set('x-admin-token', 'admin-secret').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.updated).toBe(12);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
