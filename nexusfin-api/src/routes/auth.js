const bcrypt = require('bcryptjs');
const express = require('express');
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
const { conflict, tooManyRequests, unauthorized } = require('../utils/errors');
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

module.exports = router;
