const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { env } = require('../config/env');
const { unauthorized } = require('../utils/errors');

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

const authRequired = async (req, _res, next) => {
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
    return next();
  } catch (error) {
    return next(unauthorized('Token inválido o expirado', 'TOKEN_EXPIRED'));
  }
};

module.exports = { authRequired, tokenHash };
