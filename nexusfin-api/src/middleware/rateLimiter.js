const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const authLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS' }
});

const authRegisterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS' }
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

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFromUserOrIp,
  message: { error: 'AI_RATE_LIMITED', message: 'Max 20 AI requests per hour' }
});

const adminJobsLimiter = rateLimit({
  windowMs: env.adminJobsRateLimitWindowMs,
  max: env.adminJobsRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFromUserOrIp
});

module.exports = {
  apiLimiter,
  authLimiter,
  authLoginLimiter,
  authRegisterLimiter,
  marketLimiter,
  aiLimiter,
  adminJobsLimiter,
  keyFromUserOrIp
};
