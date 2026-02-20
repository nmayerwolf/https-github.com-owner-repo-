const express = require('express');
const { query } = require('../config/db');
const { badRequest } = require('../utils/errors');

const router = express.Router();
const UUID_RE = /^[0-9a-f-]{36}$/i;
const SORT_FIELDS = new Set(['email', 'created_at', 'cost_today', 'cost_month', 'calls_today', 'calls_month']);
const ORDER_FIELDS = new Set(['asc', 'desc']);

const toUuid = (value, field = 'id') => {
  const safe = String(value || '').trim();
  if (!UUID_RE.test(safe)) throw badRequest(`${field} inválido`, 'VALIDATION_ERROR');
  return safe;
};

const toDays = (value, fallback = 30, min = 1, max = 90) => {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`days inválido (${min}-${max})`, 'VALIDATION_ERROR');
  }
  return n;
};

const toSort = (value) => {
  const safe = String(value || 'cost_month').trim().toLowerCase();
  return SORT_FIELDS.has(safe) ? safe : 'cost_month';
};

const toOrder = (value) => {
  const safe = String(value || 'desc').trim().toLowerCase();
  return ORDER_FIELDS.has(safe) ? safe : 'desc';
};

const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [
      totalUsersOut,
      activeTodayOut,
      activeWeekOut,
      costTodayOut,
      costMonthOut,
      callsTodayOut,
      callsMonthOut,
      topUsersOut
    ] = await Promise.all([
      query('SELECT COUNT(*)::int AS total FROM users'),
      query('SELECT COUNT(DISTINCT user_id)::int AS total FROM ai_usage_log WHERE created_at > CURRENT_DATE AND user_id IS NOT NULL'),
      query(
        `SELECT COUNT(DISTINCT user_id)::int AS total
         FROM ai_usage_log
         WHERE created_at >= NOW() - INTERVAL '7 days'
           AND user_id IS NOT NULL`
      ),
      query('SELECT COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total FROM ai_usage_log WHERE created_at > CURRENT_DATE'),
      query(`SELECT COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total FROM ai_usage_log WHERE created_at >= date_trunc('month', CURRENT_DATE)`),
      query('SELECT COUNT(*)::int AS total FROM ai_usage_log WHERE created_at > CURRENT_DATE'),
      query(`SELECT COUNT(*)::int AS total FROM ai_usage_log WHERE created_at >= date_trunc('month', CURRENT_DATE)`),
      query(
        `SELECT u.email, COALESCE(SUM(a.estimated_cost_usd), 0)::numeric AS cost_usd, COUNT(*)::int AS calls
         FROM ai_usage_log a
         JOIN users u ON u.id = a.user_id
         WHERE a.created_at > CURRENT_DATE
         GROUP BY u.email
         ORDER BY cost_usd DESC, calls DESC
         LIMIT 10`
      )
    ]);

    return res.json({
      total_users: Number(totalUsersOut.rows?.[0]?.total || 0),
      active_today: Number(activeTodayOut.rows?.[0]?.total || 0),
      active_this_week: Number(activeWeekOut.rows?.[0]?.total || 0),
      cost_today_usd: Number(toNum(costTodayOut.rows?.[0]?.total, 0).toFixed(6)),
      cost_this_month_usd: Number(toNum(costMonthOut.rows?.[0]?.total, 0).toFixed(6)),
      ai_calls_today: Number(callsTodayOut.rows?.[0]?.total || 0),
      ai_calls_this_month: Number(callsMonthOut.rows?.[0]?.total || 0),
      top_users_today: (topUsersOut.rows || []).map((row) => ({
        email: row.email,
        cost_usd: Number(toNum(row.cost_usd, 0).toFixed(6)),
        calls: Number(row.calls || 0)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const sort = toSort(req.query.sort);
    const order = toOrder(req.query.order);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const sortExprMap = {
      email: 'email',
      created_at: 'created_at',
      cost_today: 'cost_today',
      cost_month: 'cost_month',
      calls_today: 'calls_today',
      calls_month: 'calls_month'
    };
    const sortExpr = sortExprMap[sort] || 'cost_month';

    const out = await query(
      `WITH user_usage AS (
         SELECT
           u.id,
           u.email,
           u.role,
           u.created_at,
           COALESCE(SUM(CASE WHEN a.created_at > CURRENT_DATE THEN a.estimated_cost_usd ELSE 0 END), 0)::numeric AS cost_today,
           COALESCE(SUM(CASE WHEN a.created_at >= date_trunc('month', CURRENT_DATE) THEN a.estimated_cost_usd ELSE 0 END), 0)::numeric AS cost_month,
           COUNT(*) FILTER (WHERE a.created_at > CURRENT_DATE)::int AS calls_today,
           COUNT(*) FILTER (WHERE a.created_at >= date_trunc('month', CURRENT_DATE))::int AS calls_month
         FROM users u
         LEFT JOIN ai_usage_log a ON a.user_id = u.id
         GROUP BY u.id, u.email, u.role, u.created_at
       )
       SELECT id, email, role, created_at, cost_today, cost_month, calls_today, calls_month
       FROM user_usage
       ORDER BY ${sortExpr} ${order}, email ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.json({
      users: (out.rows || []).map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role || 'user',
        created_at: row.created_at,
        cost_today_usd: Number(toNum(row.cost_today, 0).toFixed(6)),
        cost_month_usd: Number(toNum(row.cost_month, 0).toFixed(6)),
        calls_today: Number(row.calls_today || 0),
        calls_month: Number(row.calls_month || 0)
      })),
      pagination: { limit, offset }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/users/:id/usage', async (req, res, next) => {
  try {
    const userId = toUuid(req.params.id, 'userId');
    const days = toDays(req.query.days, 30, 7, 90);
    const [dailyOut, featureOut, recentOut] = await Promise.all([
      query(
        `SELECT created_at::date AS day,
                COALESCE(SUM(estimated_cost_usd), 0)::numeric AS cost_usd,
                COUNT(*)::int AS calls
         FROM ai_usage_log
         WHERE user_id = $1
           AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY created_at::date
         ORDER BY day DESC`,
        [userId, days]
      ),
      query(
        `SELECT feature,
                COALESCE(SUM(estimated_cost_usd), 0)::numeric AS cost_usd,
                COUNT(*)::int AS calls
         FROM ai_usage_log
         WHERE user_id = $1
           AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY feature
         ORDER BY cost_usd DESC, calls DESC`,
        [userId, days]
      ),
      query(
        `SELECT id, feature, model, input_tokens, output_tokens, estimated_cost_usd, success, error_message, duration_ms, symbol, created_at
         FROM ai_usage_log
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      )
    ]);

    return res.json({
      user_id: userId,
      days,
      daily: (dailyOut.rows || []).map((row) => ({
        day: row.day,
        cost_usd: Number(toNum(row.cost_usd, 0).toFixed(6)),
        calls: Number(row.calls || 0)
      })),
      by_feature: (featureOut.rows || []).map((row) => ({
        feature: row.feature,
        cost_usd: Number(toNum(row.cost_usd, 0).toFixed(6)),
        calls: Number(row.calls || 0)
      })),
      recent: (recentOut.rows || []).map((row) => ({
        id: row.id,
        feature: row.feature,
        model: row.model,
        input_tokens: Number(row.input_tokens || 0),
        output_tokens: Number(row.output_tokens || 0),
        estimated_cost_usd: Number(toNum(row.estimated_cost_usd, 0).toFixed(6)),
        success: Boolean(row.success),
        error_message: row.error_message || null,
        duration_ms: Number(row.duration_ms || 0),
        symbol: row.symbol || null,
        created_at: row.created_at
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/costs', async (req, res, next) => {
  try {
    const days = toDays(req.query.days, 30, 7, 90);
    const [dailyOut, featureOut, modelOut, sharedOut] = await Promise.all([
      query(
        `SELECT created_at::date AS day,
                COALESCE(SUM(estimated_cost_usd), 0)::numeric AS cost_usd,
                COUNT(*)::int AS calls
         FROM ai_usage_log
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY created_at::date
         ORDER BY day DESC`,
        [days]
      ),
      query(
        `SELECT feature, COALESCE(SUM(estimated_cost_usd), 0)::numeric AS cost_usd, COUNT(*)::int AS calls
         FROM ai_usage_log
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY feature
         ORDER BY cost_usd DESC`,
        [days]
      ),
      query(
        `SELECT model, COALESCE(SUM(estimated_cost_usd), 0)::numeric AS cost_usd, COUNT(*)::int AS calls
         FROM ai_usage_log
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY model
         ORDER BY cost_usd DESC`,
        [days]
      ),
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN user_id IS NULL THEN estimated_cost_usd ELSE 0 END), 0)::numeric AS shared_cost_usd,
           COALESCE(SUM(CASE WHEN user_id IS NOT NULL THEN estimated_cost_usd ELSE 0 END), 0)::numeric AS per_user_cost_usd
         FROM ai_usage_log
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')`,
        [days]
      )
    ]);

    return res.json({
      days,
      trend: (dailyOut.rows || []).map((row) => ({
        day: row.day,
        cost_usd: Number(toNum(row.cost_usd, 0).toFixed(6)),
        calls: Number(row.calls || 0)
      })),
      by_feature: (featureOut.rows || []).map((row) => ({
        feature: row.feature,
        cost_usd: Number(toNum(row.cost_usd, 0).toFixed(6)),
        calls: Number(row.calls || 0)
      })),
      by_model: (modelOut.rows || []).map((row) => ({
        model: row.model,
        cost_usd: Number(toNum(row.cost_usd, 0).toFixed(6)),
        calls: Number(row.calls || 0)
      })),
      shared_vs_user: {
        shared_cost_usd: Number(toNum(sharedOut.rows?.[0]?.shared_cost_usd, 0).toFixed(6)),
        per_user_cost_usd: Number(toNum(sharedOut.rows?.[0]?.per_user_cost_usd, 0).toFixed(6))
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
