const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const keyFromUserOrIp = (req) => {
  const userId = String(req?.user?.id || '').trim();
  if (userId) return `user:${userId}`;
  const ip = req?.ip || req?.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
};

const marketLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFromUserOrIp
});

const adminJobsLimiter = rateLimit({
  windowMs: env.adminJobsRateLimitWindowMs,
  max: env.adminJobsRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFromUserOrIp
});

module.exports = { authLimiter, marketLimiter, adminJobsLimiter, keyFromUserOrIp };
