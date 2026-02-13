const crypto = require('crypto');
const { env } = require('../config/env');

const OAUTH_STATE_COOKIE = 'nxf_oauth_state';

const buildCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.nodeEnv === 'production',
  path: '/api/auth',
  maxAge: 10 * 60 * 1000,
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {})
});

const makeOAuthState = () => {
  const nonce = crypto.randomBytes(12).toString('hex');
  const ts = Date.now();
  const raw = `${nonce}.${ts}`;
  const sig = crypto.createHmac('sha256', env.csrfSecret).update(raw).digest('hex');
  return `${raw}.${sig}`;
};

const verifyOAuthState = (state) => {
  if (!state || typeof state !== 'string') return false;
  const parts = state.split('.');
  if (parts.length !== 3) return false;

  const [nonce, tsRaw, sig] = parts;
  const ts = Number(tsRaw);
  if (!nonce || !Number.isFinite(ts)) return false;
  if (Date.now() - ts > 10 * 60 * 1000) return false;

  const raw = `${nonce}.${ts}`;
  const expected = crypto.createHmac('sha256', env.csrfSecret).update(raw).digest('hex');

  const expBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);
  if (expBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(expBuf, sigBuf);
};

const isGoogleConfigured = () => Boolean(env.googleClientId && env.googleClientSecret && env.googleCallbackUrl);
const isAppleConfigured = () => Boolean(env.appleClientId && env.appleCallbackUrl);

const buildGoogleAuthUrl = (state) => {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleCallbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

const exchangeGoogleCode = async (code) => {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleCallbackUrl,
      grant_type: 'authorization_code'
    })
  });

  if (!tokenRes.ok) {
    throw new Error(`GOOGLE_TOKEN_HTTP_${tokenRes.status}`);
  }

  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) {
    throw new Error('GOOGLE_TOKEN_MISSING');
  }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` }
  });

  if (!userRes.ok) {
    throw new Error(`GOOGLE_USERINFO_HTTP_${userRes.status}`);
  }

  const user = await userRes.json();
  if (!user.id || !user.email) {
    throw new Error('GOOGLE_USERINFO_INCOMPLETE');
  }

  return {
    provider: 'google',
    oauthId: String(user.id),
    email: String(user.email).toLowerCase(),
    displayName: user.name || null,
    avatarUrl: user.picture || null
  };
};

const buildAppleAuthUrl = (state) => {
  const params = new URLSearchParams({
    response_type: 'code',
    response_mode: 'query',
    client_id: env.appleClientId,
    redirect_uri: env.appleCallbackUrl,
    scope: 'name email',
    state
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
};

module.exports = {
  OAUTH_STATE_COOKIE,
  buildCookieOptions,
  makeOAuthState,
  verifyOAuthState,
  isGoogleConfigured,
  isAppleConfigured,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  buildAppleAuthUrl
};
