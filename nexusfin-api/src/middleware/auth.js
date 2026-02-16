const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');
const { env } = require('../config/env');
const { unauthorized } = require('../utils/errors');

const TOKEN_REFRESH_WINDOW_SECONDS = 24 * 60 * 60;

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

const issueToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      email: user.email,
      sid: uuidv4()
    },
    env.jwtSecret,
    { expiresIn: '7d' }
  );

const issueCsrfToken = (rawToken) => {
  if (!rawToken) return null;
  return crypto.createHmac('sha256', env.csrfSecret).update(rawToken).digest('hex');
};

const verifyCsrfToken = (rawToken, csrfToken) => {
  const expected = issueCsrfToken(rawToken);
  if (!expected || !csrfToken) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(String(csrfToken));
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
};

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.nodeEnv === 'production',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {})
});

const clearCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.nodeEnv === 'production',
  path: '/',
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {})
});

const legacyApiClearCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.nodeEnv === 'production',
  path: '/api',
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {})
});

const setAuthCookies = (res, rawToken) => {
  // Cleanup old cookie scope from previous builds to avoid duplicate nxf_token cookies.
  res.clearCookie('nxf_token', legacyApiClearCookieOptions());
  res.cookie('nxf_token', rawToken, cookieOptions());
};

const clearAuthCookies = (res) => {
  res.clearCookie('nxf_token', legacyApiClearCookieOptions());
  res.clearCookie('nxf_token', clearCookieOptions());
};

const resolveRequestToken = (req) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    return { mode: 'bearer', token };
  }

  const cookieToken = req.cookies?.nxf_token;
  if (cookieToken) {
    return { mode: 'cookie', token: cookieToken };
  }

  return { mode: null, token: null };
};

const storeSession = async (userId, rawToken) => {
  await query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')`, [
    userId,
    tokenHash(rawToken)
  ]);

  await query(
    `DELETE FROM sessions
     WHERE id IN (
       SELECT id FROM sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       OFFSET 5
     )`,
    [userId]
  );
};

const shouldAutoRefresh = (payload) => {
  if (!payload?.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - now;
  return remaining > 0 && remaining < TOKEN_REFRESH_WINDOW_SECONDS;
};

const authRequired = async (req, res, next) => {
  try {
    const resolved = resolveRequestToken(req);
    if (!resolved.token) throw unauthorized('Token requerido', 'TOKEN_REQUIRED');

    const payload = jwt.verify(resolved.token, env.jwtSecret);
    const session = await query('SELECT id FROM sessions WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()', [
      payload.userId,
      tokenHash(resolved.token)
    ]);
    if (!session.rows.length) throw unauthorized('Sesión inválida', 'INVALID_SESSION');

    req.user = { id: payload.userId, email: payload.email };
    req.tokenPayload = payload;
    req.rawToken = resolved.token;
    req.authMode = resolved.mode;

    if (shouldAutoRefresh(payload)) {
      const refreshed = issueToken(req.user);
      await storeSession(req.user.id, refreshed);

      if (resolved.mode === 'cookie') {
        setAuthCookies(res, refreshed);
      } else {
        res.setHeader('X-Refresh-Token', refreshed);
      }
    }

    return next();
  } catch (error) {
    if (error?.status === 401) {
      return next(error);
    }
    return next(unauthorized('Token inválido o expirado', 'TOKEN_EXPIRED'));
  }
};

const requireCsrf = (req, _res, next) => {
  const method = String(req.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();

  if (req.authMode !== 'cookie') return next();

  const csrf = req.headers['x-csrf-token'];
  const ok = verifyCsrfToken(req.rawToken, csrf);
  if (!ok) {
    return next(unauthorized('CSRF token inválido o faltante', 'CSRF_INVALID'));
  }

  return next();
};

module.exports = {
  authRequired,
  requireCsrf,
  tokenHash,
  issueToken,
  issueCsrfToken,
  verifyCsrfToken,
  storeSession,
  shouldAutoRefresh,
  setAuthCookies,
  clearAuthCookies,
  resolveRequestToken
};
