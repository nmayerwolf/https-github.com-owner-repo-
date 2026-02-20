const express = require('express');
const { env } = require('../config/env');
const { query } = require('../config/db');
const { badRequest, forbidden, serviceUnavailable } = require('../utils/errors');

const router = express.Router();

const JOB_NAMES = new Set([
  'mvp_daily',
  'portfolio_snapshots',
  'notification_policy',
  'market_snapshot_daily',
  'fundamentals_weekly',
  'news_ingest_daily',
  'macro_radar',
  'portfolio_advisor',
  'horsai_daily'
]);
const RUN_STATUS = new Set(['started', 'success', 'failed', 'partial_failed']);

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

const parseLimit = (value) => {
  if (value == null || value === '') return 20;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 200) {
    throw badRequest('limit inválido (1..200)', 'VALIDATION_ERROR');
  }
  return Math.trunc(n);
};

const parseStatus = (value) => {
  if (value == null || value === '') return null;
  const status = String(value).trim().toLowerCase();
  if (!RUN_STATUS.has(status)) {
    throw badRequest('status inválido', 'VALIDATION_ERROR');
  }
  return status;
};

const parseDate = (value, field) => {
  if (value == null || value === '') return null;
  const safe = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) {
    throw badRequest(`${field} inválido (YYYY-MM-DD)`, 'VALIDATION_ERROR');
  }
  return safe;
};

const parseJobName = (value) => {
  if (value == null || value === '') return null;
  const job = String(value).trim().toLowerCase();
  if (!JOB_NAMES.has(job)) throw badRequest('job inválido', 'VALIDATION_ERROR');
  return job;
};

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

const auditRun = async ({ req, date, jobs, startedAt, completedAt, results }) => {
  const ip = String(req.ip || req.socket?.remoteAddress || '').slice(0, 120);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
  const status = Object.values(results || {}).every((entry) => entry?.ok === true) ? 'success' : 'partial_failed';
  const summary = {
    totalJobs: jobs.length,
    okJobs: Object.values(results || {}).filter((entry) => entry?.ok === true).length,
    failedJobs: Object.values(results || {}).filter((entry) => entry?.ok !== true).length
  };

  try {
    await query(
      `INSERT INTO admin_job_runs (
        run_date, requester_user_id, requester_ip, requester_user_agent, jobs, status, started_at, completed_at, results, summary
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10::jsonb)`,
      [
        date,
        req.user?.id || null,
        ip || null,
        userAgent || null,
        JSON.stringify(jobs),
        status,
        startedAt.toISOString(),
        completedAt.toISOString(),
        JSON.stringify(results || {}),
        JSON.stringify(summary)
      ]
    );
  } catch {
    // Keep endpoint functional even if audit table is missing.
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
      market_snapshot_daily: req.app?.locals?.marketIngestion?.runMarketSnapshotDaily,
      fundamentals_weekly: req.app?.locals?.marketIngestion?.runFundamentalsWeekly,
      news_ingest_daily: req.app?.locals?.marketIngestion?.runNewsIngestDaily,
      macro_radar: req.app?.locals?.macroRadar?.runGlobalDaily,
      portfolio_advisor: req.app?.locals?.portfolioAdvisor?.runGlobalDaily,
      horsai_daily: req.app?.locals?.horsaiDaily?.runGlobalDaily
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
    await auditRun({
      req,
      date: date || completedAt.toISOString().slice(0, 10),
      jobs,
      startedAt,
      completedAt,
      results
    });
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

router.get('/runs', async (req, res, next) => {
  try {
    ensureAuthorized(req);
    const limit = parseLimit(req.query?.limit);
    const dateFrom = parseDate(req.query?.date_from, 'date_from');
    const dateTo = parseDate(req.query?.date_to, 'date_to');
    const job = parseJobName(req.query?.job);
    const status = parseStatus(req.query?.status);

    const filters = [];
    const params = [];

    if (dateFrom) {
      params.push(dateFrom);
      filters.push(`run_date >= $${params.length}`);
    }
    if (dateTo) {
      params.push(dateTo);
      filters.push(`run_date <= $${params.length}`);
    }
    if (job) {
      params.push(job);
      filters.push(`(job_name = $${params.length} OR (jobs ? $${params.length}))`);
    }
    if (status) {
      params.push(status);
      filters.push(`status = $${params.length}`);
    }

    params.push(limit);
    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const out = await query(
      `SELECT id, run_date, requester_user_id, jobs, status, started_at, completed_at, summary
       FROM admin_job_runs
       ${whereSql}
       ORDER BY run_date DESC, started_at DESC
       LIMIT $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      filters: { limit, dateFrom, dateTo, job, status },
      runs: (out.rows || []).map((row) => ({
        id: row.id,
        runDate: row.run_date,
        requesterUserId: row.requester_user_id || null,
        jobs: Array.isArray(row.jobs) ? row.jobs : [],
        status: row.status,
        startedAt: row.started_at || null,
        completedAt: row.completed_at || null,
        summary: row.summary && typeof row.summary === 'object' ? row.summary : {}
      }))
    });
  } catch (error) {
    if (/admin_job_runs/i.test(String(error?.message || '')) && /does not exist/i.test(String(error?.message || ''))) {
      return res.json({ ok: true, filters: {}, runs: [], warning: 'ADMIN_JOB_RUNS_TABLE_MISSING' });
    }
    return next(error);
  }
});

router.get('/status', async (req, res, next) => {
  try {
    ensureAuthorized(req);
    const limit = parseLimit(req.query?.limit);
    const dateFrom = parseDate(req.query?.date_from, 'date_from');
    const dateTo = parseDate(req.query?.date_to, 'date_to');
    const job = parseJobName(req.query?.job);
    const status = parseStatus(req.query?.status);

    const filters = [];
    const params = [];

    if (dateFrom) {
      params.push(dateFrom);
      filters.push(`run_date >= $${params.length}`);
    }
    if (dateTo) {
      params.push(dateTo);
      filters.push(`run_date <= $${params.length}`);
    }
    if (job) {
      params.push(job);
      filters.push(`job_name = $${params.length}`);
    }
    if (status && ['started', 'success', 'failed'].includes(status)) {
      params.push(status);
      filters.push(`status = $${params.length}`);
    }

    params.push(limit);
    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const out = await query(
      `SELECT id, job_name, run_date, status, started_at, finished_at, error
       FROM job_runs
       ${whereSql}
       ORDER BY run_date DESC, started_at DESC
       LIMIT $${params.length}`,
      params
    );

    return res.json({
      ok: true,
      filters: { limit, dateFrom, dateTo, job, status },
      runs: (out.rows || []).map((row) => ({
        id: row.id,
        job: row.job_name,
        runDate: row.run_date,
        status: row.status,
        startedAt: row.started_at || null,
        finishedAt: row.finished_at || null,
        error: row.error || null
      }))
    });
  } catch (error) {
    if (/job_runs/i.test(String(error?.message || '')) && /does not exist/i.test(String(error?.message || ''))) {
      return res.json({ ok: true, filters: {}, runs: [], warning: 'JOB_RUNS_TABLE_MISSING' });
    }
    return next(error);
  }
});

module.exports = router;
