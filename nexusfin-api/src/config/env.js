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

const env = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  csrfSecret: process.env.CSRF_SECRET || process.env.JWT_SECRET,
  finnhubKey: process.env.FINNHUB_KEY || '',
  alphaVantageKey: process.env.ALPHA_VANTAGE_KEY || '',
  twelveDataKey: process.env.TWELVE_DATA_KEY || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  cookieDomain: process.env.COOKIE_DOMAIN || '',

  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || '',

  appleClientId: process.env.APPLE_CLIENT_ID || '',
  appleTeamId: process.env.APPLE_TEAM_ID || '',
  appleKeyId: process.env.APPLE_KEY_ID || '',
  applePrivateKey: process.env.APPLE_PRIVATE_KEY || '',
  appleCallbackUrl: process.env.APPLE_CALLBACK_URL || '',

  cronEnabled: asBool(process.env.CRON_ENABLED, false),
  cronTimezone: process.env.CRON_TIMEZONE || 'America/Argentina/Buenos_Aires',
  cronMarketIntervalMinutes: asPositiveInt(process.env.CRON_MARKET_INTERVAL, 5),
  cronCryptoIntervalMinutes: asPositiveInt(process.env.CRON_CRYPTO_INTERVAL, 15),
  cronForexIntervalMinutes: asPositiveInt(process.env.CRON_FOREX_INTERVAL, 15),
  cronCommodityIntervalMinutes: asPositiveInt(process.env.CRON_COMMODITY_INTERVAL, 60),
  cronMacroDailySchedule: process.env.CRON_MACRO_DAILY_SCHEDULE || '0 18 * * *',
  cronPortfolioDailySchedule: process.env.CRON_PORTFOLIO_DAILY_SCHEDULE || '15 18 * * *',
  cronRunDailyOnBoot: asBool(process.env.CRON_RUN_DAILY_ON_BOOT, true),
  aiAgentEnabled: asBool(process.env.AI_AGENT_ENABLED, false),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  aiAgentModel: process.env.AI_AGENT_MODEL || 'claude-haiku-4-5-20251001',
  aiAgentMaxAlertsPerUserPerDay: asPositiveInt(process.env.AI_AGENT_MAX_ALERTS_PER_USER_PER_DAY, 10),
  aiAgentCooldownHours: asPositiveInt(process.env.AI_AGENT_COOLDOWN_HOURS, 4),
  aiAgentRejectionCooldownHours: asPositiveInt(process.env.AI_AGENT_REJECTION_COOLDOWN_HOURS, 24),
  aiAgentTimeoutMs: asPositiveInt(process.env.AI_AGENT_TIMEOUT_MS, 10000),
  aiNarrativeEnabled: asBool(process.env.AI_NARRATIVE_ENABLED, false),
  aiNarrativeModel: process.env.AI_NARRATIVE_MODEL || 'claude-haiku-4-5-20251001',
  aiNarrativeTimeoutMs: asPositiveInt(process.env.AI_NARRATIVE_TIMEOUT_MS, 9000),
  adminJobToken: process.env.ADMIN_JOB_TOKEN || '',
  adminJobTokenNext: process.env.ADMIN_JOB_TOKEN_NEXT || '',
  adminJobsRateLimitWindowMs: asPositiveInt(process.env.ADMIN_JOBS_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  adminJobsRateLimitMax: asPositiveInt(process.env.ADMIN_JOBS_RATE_LIMIT_MAX, 10),
  wsPriceIntervalSeconds: asPositiveInt(process.env.WS_PRICE_INTERVAL, 20),
  realtimeEnabled: asBool(process.env.REALTIME_ENABLED, true),
  marketStrictRealtime: asBool(process.env.MARKET_STRICT_REALTIME, String(process.env.NODE_ENV || '').toLowerCase() === 'production'),

  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || '',
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || ''
};

module.exports = { env, asBool, asPositiveInt };
