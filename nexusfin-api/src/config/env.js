const dotenv = require('dotenv');

dotenv.config();

const required = ['DATABASE_URL', 'JWT_SECRET'];
required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
});

const asBool = (value, fallback = false) => {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const asPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const asString = (value, fallback) => {
  const out = String(value || '').trim();
  return out || fallback;
};

const env = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  csrfSecret: process.env.CSRF_SECRET || process.env.JWT_SECRET,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  cookieDomain: process.env.COOKIE_DOMAIN || '',

  // OAuth providers
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || '',
  appleClientId: process.env.APPLE_CLIENT_ID || '',
  appleTeamId: process.env.APPLE_TEAM_ID || '',
  appleKeyId: process.env.APPLE_KEY_ID || '',
  applePrivateKey: process.env.APPLE_PRIVATE_KEY || '',
  appleCallbackUrl: process.env.APPLE_CALLBACK_URL || '',

  // Scheduler/admin jobs
  cronEnabled: asBool(process.env.CRON_ENABLED, false),
  cronTimezone: process.env.CRON_TIMEZONE || 'America/Argentina/Buenos_Aires',
  adminJobToken: process.env.ADMIN_JOB_TOKEN || '',
  adminJobTokenNext: process.env.ADMIN_JOB_TOKEN_NEXT || '',
  adminJobsRateLimitWindowMs: asPositiveInt(process.env.ADMIN_JOBS_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  adminJobsRateLimitMax: asPositiveInt(process.env.ADMIN_JOBS_RATE_LIMIT_MAX, 10),

  // Auth/session
  jwtExpiresIn: asString(process.env.JWT_EXPIRES_IN, '30d'),
  authSessionTtlDays: asPositiveInt(process.env.AUTH_SESSION_TTL_DAYS, 30),
  authSessionsPerUser: asPositiveInt(process.env.AUTH_SESSIONS_PER_USER, 20),
  jwtRefreshWindowSeconds: asPositiveInt(process.env.JWT_REFRESH_WINDOW_SECONDS, 72 * 60 * 60),

  // Legacy provider keys (kept for backward compatibility)
  finnhubKey: process.env.FINNHUB_KEY || '',
  alphaVantageKey: process.env.ALPHA_VANTAGE_KEY || '',

  // V1 data source providers
  polygonApiKey: process.env.POLYGON_API_KEY || '',
  fmpApiKey: process.env.FMP_API_KEY || '',
  newsApiKey: process.env.NEWS_API_KEY || '',
  gdeltEnabled: asBool(process.env.GDELT_ENABLED, false),
  externalFetchTimeoutMs: asPositiveInt(process.env.EXTERNAL_FETCH_TIMEOUT_MS, 12000)
};

module.exports = { env, asBool, asPositiveInt };
