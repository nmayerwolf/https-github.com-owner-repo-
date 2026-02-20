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
  buildGoogleAuthUrl,
  exchangeGoogleCode
} = require('../services/oauth');
const { badRequest, forbidden, serviceUnavailable, unauthorized } = require('../utils/errors');
const { validateEmail } = require('../utils/validate');

const router = express.Router();
const OAUTH_MOBILE_REDIRECT_COOKIE = 'nxf_oauth_mobile_redirect';
const GMAIL_DOMAIN_RE = /@(gmail\.com|googlemail\.com)$/i;
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

const googleOnlyError = () => forbidden('Login por email/password deshabilitado. Usá Continuar con Google.', 'GOOGLE_OAUTH_ONLY');
const gmailOnlyError = () => forbidden('Solo se permiten cuentas Gmail para iniciar sesión.', 'GMAIL_ONLY');
const isGmailEmail = (email) => GMAIL_DOMAIN_RE.test(String(email || '').trim().toLowerCase());

const resolveOAuthUser = async ({ provider, oauthId, email, displayName, avatarUrl }) => {
  if (!isGmailEmail(email)) {
    throw gmailOnlyError();
  }

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
    throw unauthorized('El proveedor OAuth no entregó email para vincular cuenta', 'OAUTH_EMAIL_REQUIRED');
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
    apple: false,
    gmailOnly: true
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
    return res.redirect(302, oauthRedirect({ oauth: 'success', provider: 'google', token }));
  } catch (error) {
    if (String(error?.code || '') === 'GMAIL_ONLY') {
      if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth_error: 'gmail_only' }));
      return res.redirect(302, oauthRedirect({ oauth_error: 'gmail_only' }));
    }

    const oauthErrorDescription = String(error?.message || 'google_callback_failed').slice(0, 160);
    if (mobileRedirectUri) {
      return res.redirect(
        302,
        oauthMobileRedirect(mobileRedirectUri, {
          oauth_error: 'google_callback_failed',
          oauth_error_description: oauthErrorDescription
        })
      );
    }
    return res.redirect(
      302,
      oauthRedirect({
        oauth_error: 'google_callback_failed',
        oauth_error_description: oauthErrorDescription
      })
    );
  }
});

router.get('/apple', (_req, _res, next) => {
  try {
    throw serviceUnavailable('Apple OAuth deshabilitado. Usá Continuar con Google.', 'OAUTH_PROVIDER_DISABLED');
  } catch (error) {
    return next(error);
  }
});

const handleAppleCallback = async (req, res) => {
  const mobileRedirectUri = getMobileRedirectCookieValue(req);
  res.clearCookie(OAUTH_MOBILE_REDIRECT_COOKIE, buildCookieOptions());
  if (mobileRedirectUri) return res.redirect(302, oauthMobileRedirect(mobileRedirectUri, { oauth_error: 'provider_disabled' }));
  return res.redirect(302, oauthRedirect({ oauth_error: 'provider_disabled' }));
};

router.get('/apple/callback', handleAppleCallback);
router.post('/apple/callback', handleAppleCallback);

router.post('/register', async (req, res, next) => {
  try {
    throw forbidden('Registro por email deshabilitado. Usá Continuar con Google.', 'GOOGLE_OAUTH_ONLY');
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    throw forbidden('Login por email deshabilitado. Usá Continuar con Google.', 'GOOGLE_OAUTH_ONLY');
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
    validateEmail(req.body.email);
    throw googleOnlyError();
  } catch (error) {
    if (error?.code === 'INVALID_EMAIL') {
      throw error;
    }
    return next(error);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    throw googleOnlyError();
  } catch (error) {
    return next(error);
  }
});

router.post('/reset-password/authenticated', authRequired, requireCsrf, async (req, res, next) => {
  try {
    throw googleOnlyError();
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
    const out = await query('SELECT id, email, display_name, avatar_url, auth_provider, onboarding_completed, role FROM users WHERE id = $1', [
      req.user.id
    ]);
    const row = out.rows[0];

    if (!row) throw unauthorized('No autorizado', 'UNAUTHORIZED');

    return res.json({
      id: row.id,
      email: row.email,
      displayName: row.display_name || null,
      avatar: row.avatar_url || null,
      role: row.role || 'user',
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
       RETURNING id, email, display_name, avatar_url, auth_provider, onboarding_completed, role`,
      params
    );

    const row = out.rows[0];
    if (!row) throw unauthorized('No autorizado', 'UNAUTHORIZED');

    return res.json({
      id: row.id,
      email: row.email,
      displayName: row.display_name || null,
      avatar: row.avatar_url || null,
      role: row.role || 'user',
      authProvider: row.auth_provider || 'email',
      onboardingCompleted: !!row.onboarding_completed
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
