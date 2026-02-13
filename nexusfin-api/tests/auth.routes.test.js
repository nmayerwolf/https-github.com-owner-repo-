const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

const mockIssueToken = jest.fn(() => 'jwt-token');
const mockIssueCsrfToken = jest.fn(() => 'csrf-token');
const mockStoreSession = jest.fn(async () => {});
const mockSetAuthCookies = jest.fn();
const mockClearAuthCookies = jest.fn();
const mockAuthRequired = jest.fn((req, _res, next) => {
  req.user = { id: 'u1', email: 'user@mail.com' };
  req.rawToken = 'old.token';
  req.authMode = 'bearer';
  next();
});
const mockRequireCsrf = jest.fn((_req, _res, next) => next());
const mockTokenHash = jest.fn(() => 'hashed-old-token');

jest.mock('../src/middleware/auth', () => ({
  authRequired: (...args) => mockAuthRequired(...args),
  requireCsrf: (...args) => mockRequireCsrf(...args),
  issueToken: (...args) => mockIssueToken(...args),
  issueCsrfToken: (...args) => mockIssueCsrfToken(...args),
  storeSession: (...args) => mockStoreSession(...args),
  tokenHash: (...args) => mockTokenHash(...args),
  setAuthCookies: (...args) => mockSetAuthCookies(...args),
  clearAuthCookies: (...args) => mockClearAuthCookies(...args)
}));

const { query } = require('../src/config/db');
const bcrypt = require('bcryptjs');
const authRoutes = require('../src/routes/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
};

describe('auth routes', () => {
  beforeEach(() => {
    query.mockReset();
    bcrypt.hash.mockReset();
    bcrypt.compare.mockReset();
    mockIssueToken.mockClear();
    mockIssueCsrfToken.mockClear();
    mockStoreSession.mockClear();
    mockSetAuthCookies.mockClear();
    mockClearAuthCookies.mockClear();
    mockAuthRequired.mockClear();
    mockRequireCsrf.mockClear();
    mockTokenHash.mockClear();
  });

  it('registers a new user and sets auth cookie', async () => {
    bcrypt.hash.mockResolvedValueOnce('hash123');
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'user@mail.com', created_at: '2026-02-13T00:00:00.000Z' }] });

    const app = makeApp();
    const res = await request(app).post('/api/auth/register').send({ email: 'USER@mail.com', password: 'abc12345' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('user@mail.com');
    expect(res.body.token).toBeUndefined();
    expect(mockStoreSession).toHaveBeenCalledWith('u1', 'jwt-token');
    expect(mockSetAuthCookies).toHaveBeenCalled();
  });

  it('returns mobile token when x-client-platform=mobile', async () => {
    bcrypt.hash.mockResolvedValueOnce('hash123');
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'user@mail.com', created_at: '2026-02-13T00:00:00.000Z' }] });

    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/register')
      .set('x-client-platform', 'mobile')
      .send({ email: 'USER@mail.com', password: 'abc12345' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBe('jwt-token');
  });

  it('returns 409 when email already exists', async () => {
    query.mockResolvedValueOnce({ rows: [{ exists: 1 }] });

    const app = makeApp();
    const res = await request(app).post('/api/auth/register').send({ email: 'user@mail.com', password: 'abc12345' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_EXISTS');
  });

  it('returns 429 with retryAfter when login is locked', async () => {
    query.mockResolvedValueOnce({ rows: [{ failures: 5 }] });

    const app = makeApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'user@mail.com', password: 'abc12345' });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('TOO_MANY_ATTEMPTS');
    expect(res.body.retryAfter).toBe(900);
    expect(res.headers['retry-after']).toBe('900');
  });

  it('returns 401 when login credentials are invalid', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ failures: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'user@mail.com', password: 'abc12345' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('returns token on refresh endpoint for bearer mode', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/auth/refresh').set('Authorization', 'Bearer old.token');

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('jwt-token');
    expect(mockAuthRequired).toHaveBeenCalled();
    expect(mockRequireCsrf).toHaveBeenCalled();
    expect(mockStoreSession).toHaveBeenCalledWith('u1', 'jwt-token');
  });

  it('returns csrf token for authenticated session', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/auth/csrf').set('Authorization', 'Bearer old.token');

    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBe('csrf-token');
    expect(mockIssueCsrfToken).toHaveBeenCalledWith('old.token');
  });

  it('returns me payload for authenticated user', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'u1',
          email: 'user@mail.com',
          display_name: 'User',
          avatar_url: null,
          auth_provider: 'email',
          onboarding_completed: false
        }
      ]
    });

    const app = makeApp();
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer old.token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('u1');
    expect(res.body.email).toBe('user@mail.com');
  });

  it('invalidates active session and clears cookie on logout', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).post('/api/auth/logout').set('Authorization', 'Bearer old.token');

    expect(res.status).toBe(204);
    expect(mockAuthRequired).toHaveBeenCalled();
    expect(mockRequireCsrf).toHaveBeenCalled();
    expect(mockTokenHash).toHaveBeenCalledWith('old.token');
    expect(query).toHaveBeenCalledWith('DELETE FROM sessions WHERE user_id = $1 AND token_hash = $2', ['u1', 'hashed-old-token']);
    expect(mockClearAuthCookies).toHaveBeenCalled();
  });

  it('resets password when current password is valid', async () => {
    bcrypt.compare.mockResolvedValueOnce(true);
    bcrypt.hash.mockResolvedValueOnce('newhash123');
    query
      .mockResolvedValueOnce({ rows: [{ password_hash: 'oldhash' }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('Authorization', 'Bearer old.token')
      .send({ currentPassword: 'abc12345', newPassword: 'newpass123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockRequireCsrf).toHaveBeenCalled();
    expect(query).toHaveBeenNthCalledWith(1, 'SELECT password_hash FROM users WHERE id = $1', ['u1']);
    expect(query).toHaveBeenNthCalledWith(
      2,
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      ['newhash123', 'u1']
    );
    expect(mockTokenHash).toHaveBeenCalledWith('old.token');
    expect(query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2',
      ['u1', 'hashed-old-token']
    );
  });

  it('returns 401 when current password is invalid on reset-password', async () => {
    bcrypt.compare.mockResolvedValueOnce(false);
    query.mockResolvedValueOnce({ rows: [{ password_hash: 'oldhash' }] });

    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('Authorization', 'Bearer old.token')
      .send({ currentPassword: 'wrong', newPassword: 'newpass123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('returns 422 when new password is weak on reset-password', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('Authorization', 'Bearer old.token')
      .send({ currentPassword: 'abc12345', newPassword: 'abc' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('WEAK_PASSWORD');
    expect(query).not.toHaveBeenCalled();
  });
});
