const express = require('express');
const cookieParser = require('cookie-parser');
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
const mockBuildCookieOptions = jest.fn(() => ({ path: '/api/auth' }));
const mockVerifyOAuthState = jest.fn(() => true);
const mockIsGoogleConfigured = jest.fn(() => true);
const mockIsAppleConfigured = jest.fn(() => true);
const mockBuildGoogleAuthUrl = jest.fn((state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`);
const mockExchangeGoogleCode = jest.fn();
const mockBuildAppleAuthUrl = jest.fn((state) => `https://appleid.apple.com/auth/authorize?state=${state}`);
const mockExchangeAppleCode = jest.fn();

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

jest.mock('../src/services/oauth', () => ({
  OAUTH_STATE_COOKIE: 'nxf_oauth_state',
  buildCookieOptions: (...args) => mockBuildCookieOptions(...args),
  makeOAuthState: jest.fn(() => 'oauth-state'),
  verifyOAuthState: (...args) => mockVerifyOAuthState(...args),
  isGoogleConfigured: (...args) => mockIsGoogleConfigured(...args),
  isAppleConfigured: (...args) => mockIsAppleConfigured(...args),
  buildGoogleAuthUrl: (...args) => mockBuildGoogleAuthUrl(...args),
  exchangeGoogleCode: (...args) => mockExchangeGoogleCode(...args),
  buildAppleAuthUrl: (...args) => mockBuildAppleAuthUrl(...args),
  exchangeAppleCode: (...args) => mockExchangeAppleCode(...args)
}));

const { query } = require('../src/config/db');
const bcrypt = require('bcryptjs');
const authRoutes = require('../src/routes/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
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
    mockBuildCookieOptions.mockClear();
    mockVerifyOAuthState.mockClear();
    mockIsGoogleConfigured.mockClear();
    mockIsAppleConfigured.mockClear();
    mockBuildGoogleAuthUrl.mockClear();
    mockExchangeGoogleCode.mockClear();
    mockBuildAppleAuthUrl.mockClear();
    mockExchangeAppleCode.mockClear();
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
      .post('/api/auth/reset-password/authenticated')
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
      .post('/api/auth/reset-password/authenticated')
      .set('Authorization', 'Bearer old.token')
      .send({ currentPassword: 'wrong', newPassword: 'newpass123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('returns 422 when new password is weak on reset-password', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/reset-password/authenticated')
      .set('Authorization', 'Bearer old.token')
      .send({ currentPassword: 'abc12345', newPassword: 'abc' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('WEAK_PASSWORD');
    expect(query).not.toHaveBeenCalled();
  });

  it('forgot-password always returns 200 and does not reveal email existence', async () => {
    query
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'missing@mail.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Si existe una cuenta');
  });

  it('forgot-password stores reset token for existing user', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'user@mail.com' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'user@mail.com' });

    expect(res.status).toBe(200);
    expect(query).toHaveBeenNthCalledWith(1, 'SELECT id, email FROM users WHERE email = $1 LIMIT 1', ['user@mail.com']);
    expect(query).toHaveBeenNthCalledWith(
      2,
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      ['u1']
    );
    expect(String(query.mock.calls[2][0])).toContain('INSERT INTO password_reset_tokens');
  });

  it('reset-password by token updates password and invalidates sessions', async () => {
    bcrypt.hash.mockResolvedValueOnce('newhash123');
    query
      .mockResolvedValueOnce({ rows: [{ id: 'rt1', user_id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'reset-token',
      newPassword: 'newpass123'
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Contraseña actualizada.');
    expect(String(query.mock.calls[0][0])).toContain('FROM password_reset_tokens');
    expect(query).toHaveBeenNthCalledWith(
      2,
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      ['newhash123', 'u1']
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      ['rt1']
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      'DELETE FROM sessions WHERE user_id = $1',
      ['u1']
    );
  });

  it('reset-password by token returns INVALID_TOKEN when token is missing/expired', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'bad-token',
      newPassword: 'newpass123'
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('INVALID_TOKEN');
  });

  it('updates onboardingCompleted via patch me', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'u1',
          email: 'user@mail.com',
          display_name: 'User',
          avatar_url: null,
          auth_provider: 'email',
          onboarding_completed: true
        }
      ]
    });

    const app = makeApp();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', 'Bearer old.token')
      .send({ onboardingCompleted: true });

    expect(res.status).toBe(200);
    expect(mockRequireCsrf).toHaveBeenCalled();
    expect(res.body.onboardingCompleted).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('onboarding_completed = $1'),
      [true, 'u1']
    );
  });

  it('returns 422 for invalid onboardingCompleted in patch me', async () => {
    const app = makeApp();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', 'Bearer old.token')
      .send({ onboardingCompleted: 'si' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('completes apple callback and redirects with oauth success', async () => {
    mockExchangeAppleCode.mockResolvedValueOnce({
      provider: 'apple',
      oauthId: 'apple-uid-1',
      email: 'user@mail.com',
      displayName: null,
      avatarUrl: null
    });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'user@mail.com' }] });

    const app = makeApp();
    const res = await request(app)
      .get('/api/auth/apple/callback')
      .query({ state: 'valid-state', code: 'apple-code' })
      .set('Cookie', ['nxf_oauth_state=valid-state']);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/?oauth=success');
    expect(mockVerifyOAuthState).toHaveBeenCalledWith('valid-state');
    expect(mockExchangeAppleCode).toHaveBeenCalledWith('apple-code');
    expect(mockStoreSession).toHaveBeenCalledWith('u1', 'jwt-token');
    expect(mockSetAuthCookies).toHaveBeenCalled();
  });

  it('completes apple callback via POST form and redirects with oauth success', async () => {
    mockExchangeAppleCode.mockResolvedValueOnce({
      provider: 'apple',
      oauthId: 'apple-uid-1',
      email: 'user@mail.com',
      displayName: null,
      avatarUrl: null
    });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'user@mail.com' }] });

    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/apple/callback')
      .type('form')
      .send({ state: 'valid-state', code: 'apple-code-post' })
      .set('Cookie', ['nxf_oauth_state=valid-state']);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/?oauth=success');
    expect(mockVerifyOAuthState).toHaveBeenCalledWith('valid-state');
    expect(mockExchangeAppleCode).toHaveBeenCalledWith('apple-code-post');
    expect(mockStoreSession).toHaveBeenCalledWith('u1', 'jwt-token');
    expect(mockSetAuthCookies).toHaveBeenCalled();
  });

  it('rejects apple callback with invalid oauth state', async () => {
    mockVerifyOAuthState.mockReturnValueOnce(false);

    const app = makeApp();
    const res = await request(app)
      .get('/api/auth/apple/callback')
      .query({ state: 'invalid-state', code: 'apple-code' })
      .set('Cookie', ['nxf_oauth_state=invalid-state']);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/?oauth_error=invalid_oauth_state');
    expect(mockExchangeAppleCode).not.toHaveBeenCalled();
  });

  it('completes google callback for mobile and redirects with token deep-link', async () => {
    mockExchangeGoogleCode.mockResolvedValueOnce({
      provider: 'google',
      oauthId: 'google-uid-1',
      email: 'user@mail.com',
      displayName: 'User Name',
      avatarUrl: 'https://avatar.test/u.png'
    });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'user@mail.com' }] });

    const app = makeApp();
    const res = await request(app)
      .get('/api/auth/google/callback')
      .query({ state: 'valid-state', code: 'google-code-mobile' })
      .set('Cookie', ['nxf_oauth_state=valid-state', 'nxf_oauth_mobile_redirect=nexusfin://oauth']);

    expect(res.status).toBe(302);
    expect(res.headers.location.startsWith('nexusfin://oauth?')).toBe(true);
    expect(res.headers.location).toContain('oauth=success');
    expect(res.headers.location).toContain('provider=google');
    expect(res.headers.location).toContain('token=jwt-token');
    expect(mockVerifyOAuthState).toHaveBeenCalledWith('valid-state');
    expect(mockExchangeGoogleCode).toHaveBeenCalledWith('google-code-mobile');
    expect(mockStoreSession).toHaveBeenCalledWith('u1', 'jwt-token');
  });

  it('rejects google callback with invalid oauth state in mobile mode', async () => {
    mockVerifyOAuthState.mockReturnValueOnce(false);

    const app = makeApp();
    const res = await request(app)
      .get('/api/auth/google/callback')
      .query({ state: 'invalid-state', code: 'google-code' })
      .set('Cookie', ['nxf_oauth_state=invalid-state', 'nxf_oauth_mobile_redirect=nexusfin://oauth']);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('nexusfin://oauth?oauth_error=invalid_oauth_state');
    expect(mockExchangeGoogleCode).not.toHaveBeenCalled();
  });

  it('redirects with google callback failure in mobile mode when exchange fails', async () => {
    mockExchangeGoogleCode.mockRejectedValueOnce(new Error('boom'));

    const app = makeApp();
    const res = await request(app)
      .get('/api/auth/google/callback')
      .query({ state: 'valid-state', code: 'google-code' })
      .set('Cookie', ['nxf_oauth_state=valid-state', 'nxf_oauth_mobile_redirect=nexusfin://oauth']);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('nexusfin://oauth?oauth_error=google_callback_failed');
  });

  it('returns 422 when mobile oauth redirect_uri is invalid', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/auth/apple').query({ platform: 'mobile', redirect_uri: 'https://evil.test/callback' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('completes apple callback for mobile and redirects with token deep-link', async () => {
    mockExchangeAppleCode.mockResolvedValueOnce({
      provider: 'apple',
      oauthId: 'apple-uid-1',
      email: 'user@mail.com',
      displayName: null,
      avatarUrl: null
    });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'user@mail.com' }] });

    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/apple/callback')
      .type('form')
      .send({ state: 'valid-state', code: 'apple-code-mobile' })
      .set('Cookie', ['nxf_oauth_state=valid-state', 'nxf_oauth_mobile_redirect=nexusfin://oauth']);

    expect(res.status).toBe(302);
    expect(res.headers.location.startsWith('nexusfin://oauth?')).toBe(true);
    expect(res.headers.location).toContain('oauth=success');
    expect(res.headers.location).toContain('provider=apple');
    expect(res.headers.location).toContain('token=jwt-token');
    expect(mockVerifyOAuthState).toHaveBeenCalledWith('valid-state');
    expect(mockExchangeAppleCode).toHaveBeenCalledWith('apple-code-mobile');
    expect(mockStoreSession).toHaveBeenCalledWith('u1', 'jwt-token');
  });

  it('redirects with apple callback failure when provider exchange fails', async () => {
    mockExchangeAppleCode.mockRejectedValueOnce(new Error('boom'));

    const app = makeApp();
    const res = await request(app)
      .get('/api/auth/apple/callback')
      .query({ state: 'valid-state', code: 'apple-code' })
      .set('Cookie', ['nxf_oauth_state=valid-state']);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/?oauth_error=apple_callback_failed');
  });

});
