const express = require('express');
const { env } = require('../config/env');
const { forbidden, serviceUnavailable } = require('../utils/errors');

const router = express.Router();

const ensureAuthorized = (req) => {
  const primary = String(env.adminJobToken || '').trim();
  const secondary = String(env.adminJobTokenNext || '').trim();
  if (!primary && !secondary) {
    throw serviceUnavailable('ADMIN_JOB_TOKEN no configurado', 'ADMIN_JOBS_DISABLED');
  }

  const provided = String(req.headers['x-admin-token'] || '').trim();
  const accepted = [primary, secondary].filter(Boolean);
  if (!provided || !accepted.includes(provided)) {
    throw forbidden('Token admin inválido', 'FORBIDDEN_ADMIN_JOBS');
  }
};

router.post('/run', async (req, res, next) => {
  try {
    ensureAuthorized(req);
    const date = req.body?.date || null;

    const ingestion = req.app?.locals?.marketIngestionService;
    const brief = req.app?.locals?.briefGenerator;
    const ideas = req.app?.locals?.ideasDailyPipeline;

    const out = {
      ingestion: ingestion?.runIngestion ? await ingestion.runIngestion({ date }) : { skipped: true },
      brief: brief?.generateBrief ? await brief.generateBrief({ date }) : { skipped: true },
      ideasReview: ideas?.reviewIdeas ? await ideas.reviewIdeas({ date }) : { skipped: true },
      package: ideas?.generateDailyPackage ? await ideas.generateDailyPackage({ date, userId: req.user?.id || null }) : { skipped: true }
    };

    return res.json({ ok: true, date: date || out?.package?.date || null, results: out });
  } catch (error) {
    return next(error);
  }
});

router.get('/status', async (req, res, next) => {
  try {
    ensureAuthorized(req);
    const cronStatus = req.app?.locals?.getCronStatus?.() || {};
    return res.json({ ok: true, cron: cronStatus, ts: new Date().toISOString() });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
