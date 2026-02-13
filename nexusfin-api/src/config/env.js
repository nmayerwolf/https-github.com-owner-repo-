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
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  cookieDomain: process.env.COOKIE_DOMAIN || '',

  cronEnabled: asBool(process.env.CRON_ENABLED, false),
  cronMarketIntervalMinutes: asPositiveInt(process.env.CRON_MARKET_INTERVAL, 5),
  cronCryptoIntervalMinutes: asPositiveInt(process.env.CRON_CRYPTO_INTERVAL, 15),
  cronForexIntervalMinutes: asPositiveInt(process.env.CRON_FOREX_INTERVAL, 15),
  cronCommodityIntervalMinutes: asPositiveInt(process.env.CRON_COMMODITY_INTERVAL, 60),

  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || ''
};

module.exports = { env, asBool, asPositiveInt };
