const bcrypt = require('bcryptjs');
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

const finishLogin = async (req, res, user, status = 200) => {
  const token = issueToken(user);
  await storeSession(user.id, token);
  setAuthCookies(res, token);

  const body = { user: { id: user.id, email: user.email } };
  if (isMobileClient(req)) body.token = token;

  return res.status(status).json(body);
};

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
  res.clearCookie(OAUTH_STATE_COOKIE, buildCookieOptions());

  if (!isGoogleConfigured()) {
    return res.redirect(302, oauthRedirect({ oauth_error: 'provider_disabled' }));
  }

  if (!state || !code || !cookieState || state !== cookieState || !verifyOAuthState(state)) {
    return res.redirect(302, oauthRedirect({ oauth_error: 'invalid_oauth_state' }));
  }

  try {
    const profile = await exchangeGoogleCode(code);
    const user = await resolveOAuthUser(profile);

    const token = issueToken(user);
    await storeSession(user.id, token);
    setAuthCookies(res, token);

    return res.redirect(302, oauthRedirect({ oauth: 'success' }));
  } catch {
    return res.redirect(302, oauthRedirect({ oauth_error: 'google_callback_failed' }));
  }
});

router.get('/apple', (_req, res, next) => {
  try {
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

router.get('/apple/callback', async (req, res) => {
  const state = String(req.query.state || '');
  const code = String(req.query.code || '');
  const cookieState = String(req.cookies?.[OAUTH_STATE_COOKIE] || '');
  res.clearCookie(OAUTH_STATE_COOKIE, buildCookieOptions());

  if (!isAppleConfigured()) {
    return res.redirect(302, oauthRedirect({ oauth_error: 'provider_disabled' }));
  }

  if (!state || !code || !cookieState || state !== cookieState || !verifyOAuthState(state)) {
    return res.redirect(302, oauthRedirect({ oauth_error: 'invalid_oauth_state' }));
  }

  try {
    const profile = await exchangeAppleCode(code);
    const user = await resolveOAuthUser(profile);

    const token = issueToken(user);
    await storeSession(user.id, token);
    setAuthCookies(res, token);

    return res.redirect(302, oauthRedirect({ oauth: 'success' }));
  } catch (error) {
    if (error?.code === 'OAUTH_EMAIL_REQUIRED') {
      return res.redirect(302, oauthRedirect({ oauth_error: 'oauth_email_required' }));
    }
    return res.redirect(302, oauthRedirect({ oauth_error: 'apple_callback_failed' }));
  }
});

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

router.post('/reset-password', authRequired, requireCsrf, async (req, res, next) => {
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

    if (req.rawToken) {
      await query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, tokenHash(req.rawToken)]);
    }

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
