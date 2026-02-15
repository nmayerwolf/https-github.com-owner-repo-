const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const express = require('express');
const { env } = require('../config/env');
const { query } = require('../config/db');
const {
  authRequired,
  requireCsrf,
  issueCsrfToken,
  issueToken,
  storeSession,
  tokenHash,
  setAuthCookies,
  clearAuthCookies
} = require('../middleware/auth');
const {
  OAUTH_STATE_COOKIE,
  buildCookieOptions,
  makeOAuthState,
  verifyOAuthState,
  isGoogleConfigured,
  isAppleConfigured,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  buildAppleAuthUrl,
  exchangeAppleCode
} = require('../services/oauth');
const { badRequest, conflict, serviceUnavailable, tooManyRequests, unauthorized } = require('../utils/errors');
const { validateEmail, validatePassword } = require('../utils/validate');

const router = express.Router();
const OAUTH_MOBILE_REDIRECT_COOKIE = 'nxf_oauth_mobile_redirect';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_TOKEN_BYTES = 32;

const enforceLoginLock = async (email) => {
  const recent = await query(
    `SELECT COUNT(*)::int AS failures
     FROM login_attempts
     WHERE email = $1 AND success = false AND attempted_at > NOW() - INTERVAL '15 minutes'`,
    [email]
  );
  if (recent.rows[0].failures >= 5) {
    throw tooManyRequests('Demasiados intentos. Esperá 15 minutos.', 'TOO_MANY_ATTEMPTS', { retryAfter: 900 });
  }
};

const recordAttempt = async (email, success) => {
  await query('INSERT INTO login_attempts (email, success) VALUES ($1, $2)', [email, success]);
};

const isMobileClient = (req) => String(req.headers['x-client-platform'] || '').toLowerCase() === 'mobile';

const oauthRedirect = (status) => {
  const qs = new URLSearchParams(status).toString();
  return `${env.frontendUrl}/${qs ? `?${qs}` : ''}`;
};

const isAllowedMobileRedirectUri = (raw) => {
  if (!raw) return false;
  try {
    const parsed = new URL(String(raw));
    return parsed.protocol === 'nexusfin:';
  } catch {
    return false;
  }
};

const getMobileRedirectCookieValue = (req) => String(req.cookies?.[OAUTH_MOBILE_REDIRECT_COOKIE] || '');

const oauthMobileRedirect = (redirectUri, status = {}, token = null) => {
  const params = new URLSearchParams(status);
  if (token) params.set('token', token);
  return `${redirectUri}${redirectUri.includes('?') ? '&' : '?'}${params.toString()}`;
};

const setOAuthMobileContext = (req, res) => {
  const platform = String(req.query.platform || '').toLowerCase();
  const redirectUri = String(req.query.redirect_uri || '').trim();
  if (platform !== 'mobile') {
    res.clearCookie(OAUTH_MOBILE_REDIRECT_COOKIE, buildCookieOptions());
    return;
  }

  if (!isAllowedMobileRedirectUri(redirectUri)) {
    throw badRequest('redirect_uri mobile inválida', 'VALIDATION_ERROR');
  }

  res.cookie(OAUTH_MOBILE_REDIRECT_COOKIE, redirectUri, buildCookieOptions());
};

const finishLogin = async (req, res, user, status = 200) => {
  const token = issueToken(user);
  await storeSession(user.id, token);
  setAuthCookies(res, token);

  const body = { user: { id: user.id, email: user.email } };
  if (isMobileClient(req)) body.token = token;

  return res.status(status).json(body);
};

const hashResetToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');
const issueResetToken = () => crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');

const resolveOAuthUser = async ({ provider, oauthId, email, displayName, avatarUrl }) => {
  const byOauth = await query('SELECT id, email FROM users WHERE auth_provider = $1 AND oauth_id = $2', [provider, oauthId]);
  if (byOauth.rows.length) {
    const updated = await query(
      `UPDATE users
       SET display_name = COALESCE($1, display_name),
           avatar_url = COALESCE($2, avatar_url),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, email`,
      [displayName || null, avatarUrl || null, byOauth.rows[0].id]
    );
    return updated.rows[0];
  }

  if (email) {
    const byEmail = await query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (byEmail.rows.length) {
      const merged = await query(
        `UPDATE users
         SET auth_provider = $1,
             oauth_id = $2,
             display_name = COALESCE($3, display_name),
             avatar_url = COALESCE($4, avatar_url),
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, email`,
        [provider, oauthId, displayName || null, avatarUrl || null, byEmail.rows[0].id]
      );
      return merged.rows[0];
    }
  } else {
    throw unauthorized('Apple no entregó email para vincular cuenta', 'OAUTH_EMAIL_REQUIRED');
  }

  const created = await query(
    `INSERT INTO users (email, password_hash, display_name, auth_provider, oauth_id, avatar_url)
     VALUES ($1, NULL, $2, $3, $4, $5)
     RETURNING id, email`,
    [email, displayName || null, provider, oauthId, avatarUrl || null]
  );
  return created.rows[0];
};

router.get('/oauth/providers', (_req, res) => {
  return res.json({
    google: isGoogleConfigured(),
    apple: isAppleConfigured()
  });
});

router.get('/google', async (_req, res, next) => {
  try {
    setOAuthMobileContext(_req, res);
    if (!isGoogleConfigured()) {
      throw serviceUnavailable('Google OAuth no configurado', 'OAUTH_PROVIDER_DISABLED');
    }

    const state = makeOAuthState();
    res.cookie(OAUTH_STATE_COOKIE, state, buildCookieOptions());
    return res.redirect(302, buildGoogleAuthUrl(state));
  } catch (error) {
    return next(error);
  }
});

router.get('/google/callback', async (req, res) => {
  const state = String(req.query.state || '');
  const code = String(req.query.code || '');
  const cookieState = String(req.cookies?.[OAUTH_STATE_COOKIE] || '');
  const mobileRedirectUri = getMobileRedirectCookieValue(req);
  res.clearCookie(OAUTH_STATE_COOKIE, buildCookieOptions());
  res.clearCookie(OAUTH_MOBILE_REDIRECT_COOKIE, buildCookieOptions());

  if (!isGoogleConfigured()) {
    if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth_error: 'provider_disabled' }));
    return res.redirect(302, oauthRedirect({ oauth_error: 'provider_disabled' }));
  }

  if (!state || !code || !cookieState || state !== cookieState || !verifyOAuthState(state)) {
    if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth_error: 'invalid_oauth_state' }));
    return res.redirect(302, oauthRedirect({ oauth_error: 'invalid_oauth_state' }));
  }

  try {
    const profile = await exchangeGoogleCode(code);
    const user = await resolveOAuthUser(profile);

    const token = issueToken(user);
    await storeSession(user.id, token);
    setAuthCookies(res, token);

    if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth: 'success', provider: 'google' }, token));
    return res.redirect(302, oauthRedirect({ oauth: 'success' }));
  } catch {
    if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth_error: 'google_callback_failed' }));
    return res.redirect(302, oauthRedirect({ oauth_error: 'google_callback_failed' }));
  }
});

router.get('/apple', (_req, res, next) => {
  try {
    setOAuthMobileContext(_req, res);
    if (!isAppleConfigured()) {
      throw serviceUnavailable('Apple OAuth no configurado', 'OAUTH_PROVIDER_DISABLED');
    }

    const state = makeOAuthState();
    res.cookie(OAUTH_STATE_COOKIE, state, buildCookieOptions());
    return res.redirect(302, buildAppleAuthUrl(state));
  } catch (error) {
    return next(error);
  }
});

const handleAppleCallback = async (req, res) => {
  const state = String(req.query.state || req.body?.state || '');
  const code = String(req.query.code || req.body?.code || '');
  const cookieState = String(req.cookies?.[OAUTH_STATE_COOKIE] || '');
  const mobileRedirectUri = getMobileRedirectCookieValue(req);
  res.clearCookie(OAUTH_STATE_COOKIE, buildCookieOptions());
  res.clearCookie(OAUTH_MOBILE_REDIRECT_COOKIE, buildCookieOptions());

  if (!isAppleConfigured()) {
    if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth_error: 'provider_disabled' }));
    return res.redirect(302, oauthRedirect({ oauth_error: 'provider_disabled' }));
  }

  if (!state || !code || !cookieState || state !== cookieState || !verifyOAuthState(state)) {
    if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth_error: 'invalid_oauth_state' }));
    return res.redirect(302, oauthRedirect({ oauth_error: 'invalid_oauth_state' }));
  }

  try {
    const profile = await exchangeAppleCode(code);
    const user = await resolveOAuthUser(profile);

    const token = issueToken(user);
    await storeSession(user.id, token);
    setAuthCookies(res, token);

    if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth: 'success', provider: 'apple' }, token));
    return res.redirect(302, oauthRedirect({ oauth: 'success' }));
  } catch (error) {
    if (error?.code === 'OAUTH_EMAIL_REQUIRED') {
      if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth_error: 'oauth_email_required' }));
      return res.redirect(302, oauthRedirect({ oauth_error: 'oauth_email_required' }));
    }
    if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth_error: 'apple_callback_failed' }));
    return res.redirect(302, oauthRedirect({ oauth_error: 'apple_callback_failed' }));
  }
};

router.get('/apple/callback', handleAppleCallback);
router.post('/apple/callback', handleAppleCallback);

router.post('/register', async (req, res, next) => {
  try {
    const email = validateEmail(req.body.email);
    const password = validatePassword(req.body.password);

    const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) throw conflict('Ya existe una cuenta con ese email', 'EMAIL_EXISTS');

    const hash = await bcrypt.hash(password, 10);
    const created = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, hash]
    );

    const user = created.rows[0];
    const token = issueToken(user);
    await storeSession(user.id, token);
    setAuthCookies(res, token);

    const body = { user: { id: user.id, email: user.email, createdAt: user.created_at } };
    if (isMobileClient(req)) body.token = token;

    return res.status(201).json(body);
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = validateEmail(req.body.email);
    const password = String(req.body.password || '');

    await enforceLoginLock(email);

    const found = await query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
    if (!found.rows.length) {
      await recordAttempt(email, false);
      throw unauthorized('Email o contraseña incorrectos', 'INVALID_CREDENTIALS');
    }

    const user = found.rows[0];

    if (!user.password_hash) {
      await recordAttempt(email, false);
      throw unauthorized('Usá login social para esta cuenta', 'USE_OAUTH_LOGIN');
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await recordAttempt(email, false);
      throw unauthorized('Email o contraseña incorrectos', 'INVALID_CREDENTIALS');
    }

    await recordAttempt(email, true);
    const token = issueToken(user);
    await storeSession(user.id, token);
    setAuthCookies(res, token);

    const body = { user: { id: user.id, email: user.email } };
    if (isMobileClient(req)) body.token = token;

    return res.json(body);
  } catch (error) {
    return next(error);
  }
});

router.post('/refresh', authRequired, requireCsrf, async (req, res, next) => {
  try {
    const user = req.user;
    const token = issueToken(user);
    await storeSession(user.id, token);

    if (req.authMode === 'cookie') {
      setAuthCookies(res, token);
      return res.json({ ok: true });
    }

    return res.json({ token });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', authRequired, requireCsrf, async (req, res, next) => {
  try {
    const rawToken = req.rawToken;
    if (!rawToken) throw unauthorized('Token requerido', 'TOKEN_REQUIRED');

    await query('DELETE FROM sessions WHERE user_id = $1 AND token_hash = $2', [req.user.id, tokenHash(rawToken)]);
    clearAuthCookies(res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = validateEmail(req.body.email);
    const found = await query('SELECT id, email FROM users WHERE email = $1 LIMIT 1', [email]);

    if (found.rows.length) {
      const userId = found.rows[0].id;
      const rawToken = issueResetToken();
      const tokenHashValue = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

      await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHashValue, expiresAt]
      );

      if (env.nodeEnv !== 'production' && String(process.env.LOG_PASSWORD_RESET_TOKENS || '').toLowerCase() === 'true') {
        console.log(`[auth] password reset token for ${email}: ${rawToken}`);
      }
    }

    return res.json({ message: 'Si existe una cuenta con ese email, recibirás un link de reseteo.' });
  } catch (error) {
    if (error?.code === 'INVALID_EMAIL') {
      return res.json({ message: 'Si existe una cuenta con ese email, recibirás un link de reseteo.' });
    }
    return next(error);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = validatePassword(req.body.newPassword);
    if (!token) {
      throw badRequest('token requerido', 'VALIDATION_ERROR');
    }

    const tokenHashValue = hashResetToken(token);
    const found = await query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [tokenHashValue]
    );
    if (!found.rows.length) {
      throw badRequest('El link expiró o es inválido.', 'INVALID_TOKEN');
    }

    const tokenRow = found.rows[0];

    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, tokenRow.user_id]);
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenRow.id]);
    await query('DELETE FROM sessions WHERE user_id = $1', [tokenRow.user_id]);

    return res.json({ message: 'Contraseña actualizada.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/reset-password/authenticated', authRequired, requireCsrf, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = validatePassword(req.body.newPassword);

    const found = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!found.rows.length) throw unauthorized('No autorizado', 'UNAUTHORIZED');

    if (!found.rows[0].password_hash) {
      throw unauthorized('Cuenta OAuth sin contraseña local', 'OAUTH_ACCOUNT_NO_PASSWORD');
    }

    const ok = await bcrypt.compare(currentPassword, found.rows[0].password_hash);
    if (!ok) {
      throw unauthorized('La contraseña actual es incorrecta', 'INVALID_CURRENT_PASSWORD');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
    if (req.rawToken) await query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, tokenHash(req.rawToken)]);

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/csrf', authRequired, async (req, res) => {
  const csrfToken = issueCsrfToken(req.rawToken);
  return res.json({ csrfToken });
});

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const out = await query('SELECT id, email, display_name, avatar_url, auth_provider, onboarding_completed FROM users WHERE id = $1', [
      req.user.id
    ]);
    const row = out.rows[0];

    if (!row) throw unauthorized('No autorizado', 'UNAUTHORIZED');

    return res.json({
      id: row.id,
      email: row.email,
      displayName: row.display_name || null,
      avatar: row.avatar_url || null,
      authProvider: row.auth_provider || 'email',
      onboardingCompleted: !!row.onboarding_completed
    });
  } catch (error) {
    return next(error);
  }
});


router.patch('/me', authRequired, requireCsrf, async (req, res, next) => {
  try {
    const changes = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'onboardingCompleted')) {
      if (typeof req.body.onboardingCompleted !== 'boolean') {
        throw badRequest('onboardingCompleted debe ser booleano', 'VALIDATION_ERROR');
      }
      params.push(req.body.onboardingCompleted);
      changes.push(`onboarding_completed = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'displayName')) {
      const displayName = String(req.body.displayName || '').trim();
      if (displayName.length > 100) {
        throw badRequest('displayName no puede superar 100 caracteres', 'VALIDATION_ERROR');
      }
      params.push(displayName || null);
      changes.push(`display_name = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar')) {
      const avatar = req.body.avatar ? String(req.body.avatar) : null;
      params.push(avatar);
      changes.push(`avatar_url = $${params.length}`);
    }

    if (!changes.length) {
      throw badRequest('No hay cambios para actualizar', 'VALIDATION_ERROR');
    }

    params.push(req.user.id);

    const out = await query(
      `UPDATE users
       SET ${changes.join(', ')},
           updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING id, email, display_name, avatar_url, auth_provider, onboarding_completed`,
      params
    );

    const row = out.rows[0];
    if (!row) throw unauthorized('No autorizado', 'UNAUTHORIZED');

    return res.json({
      id: row.id,
      email: row.email,
      displayName: row.display_name || null,
      avatar: row.avatar_url || null,
      authProvider: row.auth_provider || 'email',
      onboardingCompleted: !!row.onboarding_completed
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
