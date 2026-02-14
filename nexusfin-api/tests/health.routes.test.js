process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

const { query } = require('../src/config/db');
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
    expect(res.body.ws.enabled).toBe(true);
    expect(typeof res.body.ws.intervalMs).toBe('number');
    expect(typeof res.body.push.expo).toBe('boolean');
    expect(typeof res.body.push.web).toBe('boolean');
    expect(typeof res.body.auth.appleConfigured).toBe('boolean');
    expect(typeof res.body.ts).toBe('string');
  });
});
