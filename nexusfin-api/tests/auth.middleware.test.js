const cookieParser = require('cookie-parser');
const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'csrf-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
  sign: jest.fn(() => 'refreshed.jwt.token')
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'sid-refresh')
}));

const jwt = require('jsonwebtoken');
const { query } = require('../src/config/db');
const { authRequired, requireCsrf, issueCsrfToken } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.get('/protected', authRequired, (_req, res) => {
    res.json({ ok: true });
  });
  app.post('/mutate', authRequired, requireCsrf, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
};

describe('auth middleware', () => {
  beforeEach(() => {
    query.mockReset();
    jwt.verify.mockReset();
    jwt.sign.mockReset();
    jwt.sign.mockReturnValue('refreshed.jwt.token');
  });

  it('returns TOKEN_REQUIRED when auth header is missing', async () => {
    const app = makeApp();
    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_REQUIRED');
  });

  it('returns INVALID_SESSION when token signature is valid but session is not found', async () => {
    const now = Math.floor(Date.now() / 1000);

    jwt.verify.mockReturnValueOnce({ userId: 'u1', email: 'user@mail.com', exp: now + 60 * 60 * 48 });
    query.mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid.token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SESSION');
  });

  it('returns TOKEN_EXPIRED when JWT verification fails', async () => {
    jwt.verify.mockImplementationOnce(() => {
      throw new Error('jwt expired');
    });

    const app = makeApp();
    const res = await request(app).get('/protected').set('Authorization', 'Bearer expired.token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_EXPIRED');
  });

  it('adds X-Refresh-Token when bearer token expires within 24h', async () => {
    const now = Math.floor(Date.now() / 1000);

    jwt.verify.mockReturnValueOnce({ userId: 'u1', email: 'user@mail.com', exp: now + 60 * 60 });
    query
      .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid.token');

    expect(res.status).toBe(200);
    expect(res.headers['x-refresh-token']).toBe('refreshed.jwt.token');
    expect(jwt.sign).toHaveBeenCalled();
  });

  it('does not add X-Refresh-Token when token is still fresh', async () => {
    const now = Math.floor(Date.now() / 1000);

    jwt.verify.mockReturnValueOnce({ userId: 'u1', email: 'user@mail.com', exp: now + 60 * 60 * 48 });
    query.mockResolvedValueOnce({ rows: [{ id: 's1' }] });

    const app = makeApp();
    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid.token');

    expect(res.status).toBe(200);
    expect(res.headers['x-refresh-token']).toBeUndefined();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('requires csrf token for cookie-based mutating requests', async () => {
    const now = Math.floor(Date.now() / 1000);
    jwt.verify.mockReturnValueOnce({ userId: 'u1', email: 'user@mail.com', exp: now + 60 * 60 * 48 });
    query.mockResolvedValueOnce({ rows: [{ id: 's1' }] });

    const app = makeApp();
    const res = await request(app).post('/mutate').set('Cookie', ['nxf_token=cookie.token']).send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('CSRF_INVALID');
  });

  it('accepts csrf token for cookie-based mutating requests', async () => {
    const now = Math.floor(Date.now() / 1000);
    jwt.verify.mockReturnValueOnce({ userId: 'u1', email: 'user@mail.com', exp: now + 60 * 60 * 48 });
    query.mockResolvedValueOnce({ rows: [{ id: 's1' }] });

    const app = makeApp();
    const csrf = issueCsrfToken('cookie.token');
    const res = await request(app)
      .post('/mutate')
      .set('Cookie', ['nxf_token=cookie.token'])
      .set('X-CSRF-Token', csrf)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
