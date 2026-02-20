const express = require('express');
const { env } = require('../config/env');
const { badRequest, forbidden, serviceUnavailable } = require('../utils/errors');

const router = express.Router();

const JOB_NAMES = new Set([
  'mvp_daily',
  'portfolio_snapshots',
  'notification_policy',
  'macro_radar',
  'portfolio_advisor'
]);

const parseJobs = (value) => {
  if (value == null) {
    return ['mvp_daily', 'portfolio_snapshots', 'notification_policy'];
  }

  if (!Array.isArray(value)) {
    throw badRequest('jobs debe ser un array', 'VALIDATION_ERROR');
  }

  const jobs = value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  if (!jobs.length) throw badRequest('jobs no puede estar vacío', 'VALIDATION_ERROR');

  const invalid = jobs.filter((job) => !JOB_NAMES.has(job));
  if (invalid.length) {
    throw badRequest(`jobs inválidos: ${invalid.join(', ')}`, 'VALIDATION_ERROR');
  }

  return Array.from(new Set(jobs));
};

const ensureAuthorized = (req) => {
  const configured = String(env.adminJobToken || '').trim();
  if (!configured) {
    throw serviceUnavailable('ADMIN_JOB_TOKEN no configurado', 'ADMIN_JOBS_DISABLED');
  }

  const provided = String(req.headers['x-admin-token'] || '').trim();
  if (!provided || provided !== configured) {
    throw forbidden('Token admin inválido', 'FORBIDDEN_ADMIN_JOBS');
  }
};

router.post('/run', async (req, res, next) => {
  try {
    ensureAuthorized(req);
    const date = req.body?.date ? String(req.body.date).trim() : null;
    const jobs = parseJobs(req.body?.jobs);

    const services = {
      mvp_daily: req.app?.locals?.mvpDailyPipeline?.runDaily,
      portfolio_snapshots: req.app?.locals?.portfolioSnapshots?.runDaily,
      notification_policy: req.app?.locals?.notificationPolicy?.runDaily,
      macro_radar: req.app?.locals?.macroRadar?.runGlobalDaily,
      portfolio_advisor: req.app?.locals?.portfolioAdvisor?.runGlobalDaily
    };

    const startedAt = new Date();
    const results = {};

    for (const job of jobs) {
      const fn = services[job];
      if (typeof fn !== 'function') {
        results[job] = { ok: false, error: 'SERVICE_UNAVAILABLE' };
        continue;
      }

      try {
        const out = await fn({ date });
        results[job] = { ok: true, output: out || {} };
      } catch (error) {
        results[job] = {
          ok: false,
          error: String(error?.code || error?.message || 'UNKNOWN_ERROR').slice(0, 200)
        };
      }
    }

    const completedAt = new Date();
    return res.json({
      ok: true,
      date: date || completedAt.toISOString().slice(0, 10),
      jobs,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      results
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
