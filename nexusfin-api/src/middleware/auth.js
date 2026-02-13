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
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized('Token requerido');

    const payload = jwt.verify(token, env.jwtSecret);
    const session = await query('SELECT id FROM sessions WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()', [
      payload.userId,
      tokenHash(token)
    ]);
    if (!session.rows.length) throw unauthorized('Sesión inválida', 'INVALID_SESSION');

    req.user = { id: payload.userId, email: payload.email };
    req.tokenPayload = payload;
    req.rawToken = token;

    if (shouldAutoRefresh(payload)) {
      const refreshed = issueToken(req.user);
      await storeSession(req.user.id, refreshed);
      res.setHeader('X-Refresh-Token', refreshed);
    }

    return next();
  } catch (error) {
    return next(unauthorized('Token inválido o expirado', 'TOKEN_EXPIRED'));
  }
};

module.exports = { authRequired, tokenHash, issueToken, storeSession, shouldAutoRefresh };
