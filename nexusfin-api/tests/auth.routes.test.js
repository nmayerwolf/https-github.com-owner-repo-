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
const mockBuildGoogleAuthUrl = jest.fn((state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`);
const mockExchangeGoogleCode = jest.fn();

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
  buildGoogleAuthUrl: (...args) => mockBuildGoogleAuthUrl(...args),
  exchangeGoogleCode: (...args) => mockExchangeGoogleCode(...args)
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
    mockBuildGoogleAuthUrl.mockClear();
    mockExchangeGoogleCode.mockClear();
  });

  it('blocks register endpoint and requires Google OAuth', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/auth/register').send({ email: 'USER@mail.com', password: 'abc12345' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('GOOGLE_OAUTH_ONLY');
    expect(query).not.toHaveBeenCalled();
    expect(mockStoreSession).not.toHaveBeenCalled();
    expect(mockSetAuthCookies).not.toHaveBeenCalled();
  });

  it('blocks login endpoint and requires Google OAuth', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'user@mail.com', password: 'abc12345' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('GOOGLE_OAUTH_ONLY');
    expect(query).not.toHaveBeenCalled();
    expect(mockStoreSession).not.toHaveBeenCalled();
    expect(mockSetAuthCookies).not.toHaveBeenCalled();
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

  it('blocks authenticated password reset endpoint and requires Google OAuth', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/reset-password/authenticated')
      .set('Authorization', 'Bearer old.token')
      .send({ currentPassword: 'abc12345', newPassword: 'newpass123' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('GOOGLE_OAUTH_ONLY');
    expect(query).not.toHaveBeenCalled();
  });

  it('blocks forgot-password endpoint and requires Google OAuth', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'missing@mail.com' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('GOOGLE_OAUTH_ONLY');
    expect(query).not.toHaveBeenCalled();
  });

  it('blocks reset-password by token endpoint and requires Google OAuth', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'bad-token',
      newPassword: 'newpass123'
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('GOOGLE_OAUTH_ONLY');
    expect(query).not.toHaveBeenCalled();
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

  it('returns 400 for invalid onboardingCompleted in patch me', async () => {
    const app = makeApp();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', 'Bearer old.token')
      .send({ onboardingCompleted: 'si' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns provider disabled for apple route', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/auth/apple');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('OAUTH_PROVIDER_DISABLED');
  });

  it('redirects with provider disabled on apple callback', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/auth/apple/callback')
      .query({ state: 'valid-state', code: 'apple-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/?oauth_error=provider_disabled');
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
    expect(res.headers.location).toContain('nexusfin://oauth?oauth_error=google_callback_failed');
    expect(res.headers.location).toContain('oauth_error_description=boom');
  });

  it('returns 400 when mobile oauth redirect_uri is invalid for google route', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/auth/google').query({ platform: 'mobile', redirect_uri: 'https://evil.test/callback' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('redirects with provider disabled on apple callback in mobile mode', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/apple/callback')
      .type('form')
      .send({ state: 'valid-state', code: 'apple-code-mobile' })
      .set('Cookie', ['nxf_oauth_mobile_redirect=nexusfin://oauth']);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('nexusfin://oauth?oauth_error=provider_disabled');
  });

  it('redirects with provider disabled on apple callback via GET', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/auth/apple/callback')
      .query({ state: 'valid-state', code: 'apple-code' })
      .set('Cookie', ['nxf_oauth_state=valid-state']);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/?oauth_error=provider_disabled');
  });

});
