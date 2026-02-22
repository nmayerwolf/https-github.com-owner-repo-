process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

const { query } = require('../src/config/db');
const { env } = require('../src/config/env');
const { app } = require('../src/index');

describe('health routes', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('GET /api/health returns ok when db is up', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe('up');
    expect(typeof res.body.ts).toBe('string');
  });

  test('GET /api/health/mobile returns mobile capability payload', async () => {
    const res = await request(app).get('/api/health/mobile');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ws.enabled).toBe(Boolean(env.realtimeEnabled));
    expect(typeof res.body.ws.intervalMs).toBe('number');
    expect(typeof res.body.push.expo).toBe('boolean');
    expect(typeof res.body.push.web).toBe('boolean');
    expect(typeof res.body.auth.googleConfigured).toBe('boolean');
    expect(typeof res.body.auth.appleConfigured).toBe('boolean');
    expect(res.body.auth.appleConfigured).toBe(false);
    expect(typeof res.body.ts).toBe('string');
  });

  test('GET /api/health/phase3 returns readiness summary', async () => {
    const res = await request(app).get('/api/health/phase3');

    expect(res.status).toBe(200);
    expect(typeof res.body.ok).toBe('boolean');
    expect(typeof res.body.score).toBe('number');
    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.check).toBe('object');
    expect(res.body.total).toBeGreaterThan(0);
    expect(typeof res.body.check.marketUniverse).toBe('boolean');
    expect(typeof res.body.check.realtimeWs).toBe('boolean');
    expect(typeof res.body.ts).toBe('string');
  });

  test('GET /api/health/cron returns cron status payload', async () => {
    const res = await request(app).get('/api/health/cron');

    expect(res.status).toBe(200);
    expect(typeof res.body.enabled).toBe('boolean');
    expect(res.body).toHaveProperty('lastRun');
    expect(res.body).toHaveProperty('lastDuration');
    expect(res.body).toHaveProperty('alertsGenerated');
    expect(res.body).toHaveProperty('stopLossChecked');
    expect(res.body).toHaveProperty('nextRun');
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test('GET /api/health/yahoo returns yahoo diagnostics payload', async () => {
    const res = await request(app).get('/api/health/yahoo');

    expect([200, 503]).toContain(res.status);
    expect(typeof res.body.ok).toBe('boolean');
    expect(res.body.provider).toBe('yahoo-finance2');
    expect(typeof res.body.mode).toBe('string');
    expect(res.body).toHaveProperty('quote');
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.ts).toBe('string');
  });
});
