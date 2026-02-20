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
});
