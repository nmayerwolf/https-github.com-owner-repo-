const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const { env } = require('../src/config/env');
const routes = require('../src/routes/adminJobs');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (locals = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.locals = { ...app.locals, ...locals };
  app.use('/api/admin/jobs', routes);
  app.use(errorHandler);
  return app;
};

describe('admin jobs route', () => {
  const prevToken = env.adminJobToken;
  const prevTokenNext = env.adminJobTokenNext;

  beforeEach(() => {
    env.adminJobToken = 'admin-secret';
    env.adminJobTokenNext = 'admin-secret-next';
    query.mockReset();
    query.mockResolvedValue({ rows: [{ id: 'run-1' }] });
  });

  afterAll(() => {
    env.adminJobToken = prevToken;
    env.adminJobTokenNext = prevTokenNext;
  });

  it('rejects requests without admin token', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/admin/jobs/run').send({ jobs: ['mvp_daily'] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ADMIN_JOBS');
  });

  it('runs selected jobs with admin token', async () => {
    const app = makeApp({
      mvpDailyPipeline: { runDaily: jest.fn(async ({ date }) => ({ generated: 2, date: date || '2026-02-20' })) },
      portfolioSnapshots: { runDaily: jest.fn(async () => ({ generated: 1 })) },
      notificationPolicy: { runDaily: jest.fn(async () => ({ sent: 1 })) }
    });

    const res = await request(app)
      .post('/api/admin/jobs/run')
      .set('x-admin-token', 'admin-secret')
      .send({ jobs: ['mvp_daily', 'portfolio_snapshots', 'notification_policy'], date: '2026-02-20' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.results.mvp_daily.ok).toBe(true);
    expect(res.body.results.portfolio_snapshots.ok).toBe(true);
    expect(res.body.results.notification_policy.ok).toBe(true);
    expect(query).toHaveBeenCalled();
  });

  it('uses defaults when jobs is omitted', async () => {
    const app = makeApp({
      mvpDailyPipeline: { runDaily: jest.fn(async () => ({ generated: 1 })) },
      portfolioSnapshots: { runDaily: jest.fn(async () => ({ generated: 1 })) },
      notificationPolicy: { runDaily: jest.fn(async () => ({ sent: 0 })) }
    });

    const res = await request(app)
      .post('/api/admin/jobs/run')
      .set('x-admin-token', 'admin-secret')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual(['mvp_daily', 'portfolio_snapshots', 'notification_policy']);
  });

  it('accepts secondary token for rotation windows', async () => {
    const app = makeApp({
      mvpDailyPipeline: { runDaily: jest.fn(async () => ({ generated: 1 })) },
      portfolioSnapshots: { runDaily: jest.fn(async () => ({ generated: 1 })) },
      notificationPolicy: { runDaily: jest.fn(async () => ({ sent: 0 })) }
    });

    const res = await request(app)
      .post('/api/admin/jobs/run')
      .set('x-admin-token', 'admin-secret-next')
      .send({ jobs: ['mvp_daily'] });

    expect(res.status).toBe(200);
    expect(res.body.results.mvp_daily.ok).toBe(true);
  });

  it('runs market ingestion jobs when requested', async () => {
    const app = makeApp({
      marketIngestion: {
        runMarketSnapshotDaily: jest.fn(async () => ({ generated: 100 })),
        runFundamentalsWeekly: jest.fn(async () => ({ generated: 20 })),
        runNewsIngestDaily: jest.fn(async () => ({ generated: 15 }))
      }
    });

    const res = await request(app)
      .post('/api/admin/jobs/run')
      .set('x-admin-token', 'admin-secret')
      .send({ jobs: ['market_snapshot_daily', 'fundamentals_weekly', 'news_ingest_daily'], date: '2026-02-20' });

    expect(res.status).toBe(200);
    expect(res.body.results.market_snapshot_daily.ok).toBe(true);
    expect(res.body.results.fundamentals_weekly.ok).toBe(true);
    expect(res.body.results.news_ingest_daily.ok).toBe(true);
  });

  it('runs horsai_daily when requested', async () => {
    const app = makeApp({
      horsaiDaily: {
        runGlobalDaily: jest.fn(async ({ date }) => ({
          date: date || '2026-02-20',
          portfoliosScanned: 4,
          scored: 4,
          generated: 2
        }))
      }
    });

    const res = await request(app)
      .post('/api/admin/jobs/run')
      .set('x-admin-token', 'admin-secret')
      .send({ jobs: ['horsai_daily'], date: '2026-02-20' });

    expect(res.status).toBe(200);
    expect(res.body.results.horsai_daily.ok).toBe(true);
    expect(res.body.results.horsai_daily.output.generated).toBe(2);
  });

  it('lists admin job runs with filters', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'run-2',
          run_date: '2026-02-20',
          requester_user_id: 'u1',
          jobs: ['mvp_daily'],
          status: 'success',
          started_at: '2026-02-20T08:00:00.000Z',
          completed_at: '2026-02-20T08:00:05.000Z',
          summary: { totalJobs: 1, okJobs: 1, failedJobs: 0 }
        }
      ]
    });

    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/jobs/runs?limit=10&job=mvp_daily&status=success&date_from=2026-02-01&date_to=2026-02-20')
      .set('x-admin-token', 'admin-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.runs).toHaveLength(1);
    expect(res.body.runs[0].id).toBe('run-2');
    expect(res.body.runs[0].jobs).toEqual(['mvp_daily']);
    expect(res.body.filters.limit).toBe(10);
  });

  it('returns empty runs with warning when audit table is missing', async () => {
    query.mockRejectedValueOnce(new Error('relation "admin_job_runs" does not exist'));
    const app = makeApp();
    const res = await request(app).get('/api/admin/jobs/runs').set('x-admin-token', 'admin-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.runs).toEqual([]);
    expect(res.body.warning).toBe('ADMIN_JOB_RUNS_TABLE_MISSING');
  });

  it('validates limit in runs endpoint', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/admin/jobs/runs?limit=0').set('x-admin-token', 'admin-secret');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lists job status history from job_runs', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'jr-1',
          job_name: 'mvp_daily',
          run_date: '2026-02-20',
          status: 'success',
          started_at: '2026-02-20T06:00:00.000Z',
          finished_at: '2026-02-20T06:00:10.000Z',
          error: null
        }
      ]
    });

    const app = makeApp();
    const res = await request(app)
      .get('/api/admin/jobs/status?job=mvp_daily&status=success&date_from=2026-02-01&date_to=2026-02-20&limit=5')
      .set('x-admin-token', 'admin-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.runs).toHaveLength(1);
    expect(res.body.runs[0].job).toBe('mvp_daily');
    expect(res.body.runs[0].status).toBe('success');
    expect(res.body.filters.limit).toBe(5);
  });

  it('returns warning when job_runs table is missing', async () => {
    query.mockRejectedValueOnce(new Error('relation "job_runs" does not exist'));
    const app = makeApp();
    const res = await request(app).get('/api/admin/jobs/status').set('x-admin-token', 'admin-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.runs).toEqual([]);
    expect(res.body.warning).toBe('JOB_RUNS_TABLE_MISSING');
  });
});
