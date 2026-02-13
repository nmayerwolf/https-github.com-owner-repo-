const express = require('express');
const { query } = require('../config/db');
const { badRequest, conflict, forbidden, notFound } = require('../utils/errors');

const router = express.Router();

const allowedTypes = new Set(['opportunity', 'bearish', 'stop_loss']);

const toAlertSummary = (row) => ({
  id: row.id,
  symbol: row.symbol,
  name: row.name,
  type: row.type,
  recommendation: row.recommendation,
  confidence: row.confidence,
  confluenceBull: row.confluence_bull,
  confluenceBear: row.confluence_bear,
  signals: row.signals || [],
  priceAtAlert: Number(row.price_at_alert),
  stopLoss: row.stop_loss == null ? null : Number(row.stop_loss),
  takeProfit: row.take_profit == null ? null : Number(row.take_profit),
  currentPrice: null,
  priceChange: null,
  outcome: row.outcome || 'open',
  aiThesis: row.ai_thesis,
  createdAt: row.created_at,
  notified: !!row.notified
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const type = req.query.type ? String(req.query.type).trim() : null;

    if (type && !allowedTypes.has(type)) {
      throw badRequest('Tipo de alerta inválido', 'VALIDATION_ERROR');
    }

    const where = ['user_id = $1'];
    const params = [req.user.id];

    if (type) {
      params.push(type);
      where.push(`type = $${params.length}`);
    }

    const whereSql = where.join(' AND ');

    const listQuery = `
      SELECT id, symbol, name, type, recommendation, confidence, confluence_bull, confluence_bear,
             signals, price_at_alert, stop_loss, take_profit, outcome, ai_thesis, notified, created_at
      FROM alerts
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const list = await query(listQuery, [...params, limit, offset]);

    const count = await query(`SELECT COUNT(*)::int AS total FROM alerts WHERE ${whereSql}`, params);

    const stats = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE type = 'opportunity')::int AS opportunities,
         COUNT(*) FILTER (WHERE type = 'bearish')::int AS bearish,
         COUNT(*) FILTER (WHERE type = 'stop_loss')::int AS stop_loss,
         COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins,
         COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses,
         AVG(((outcome_price - price_at_alert) / NULLIF(price_at_alert,0)) * 100)
           FILTER (WHERE outcome = 'win' AND outcome_price IS NOT NULL)::float AS avg_return
       FROM alerts
       WHERE user_id = $1`,
      [req.user.id]
    );

    const s = stats.rows[0] || {};
    const wins = Number(s.wins || 0);
    const losses = Number(s.losses || 0);

    return res.json({
      alerts: list.rows.map(toAlertSummary),
      pagination: {
        page,
        limit,
        total: Number(count.rows[0]?.total || 0),
        pages: Math.max(1, Math.ceil(Number(count.rows[0]?.total || 0) / limit))
      },
      stats: {
        total: Number(s.total || 0),
        opportunities: Number(s.opportunities || 0),
        bearish: Number(s.bearish || 0),
        stopLoss: Number(s.stop_loss || 0),
        hitRate: wins + losses > 0 ? wins / (wins + losses) : 0,
        avgReturn: Number.isFinite(s.avg_return) ? Number(s.avg_return) : 0
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const out = await query(
      `SELECT id, symbol, name, type, recommendation, confidence, confluence_bull, confluence_bear,
              signals, price_at_alert, stop_loss, take_profit, outcome, outcome_price, outcome_date,
              ai_thesis, snapshot, notified, created_at
       FROM alerts
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (!out.rows.length) throw notFound('Alerta no encontrada', 'ALERT_NOT_FOUND');

    const row = out.rows[0];
    return res.json({
      ...toAlertSummary(row),
      outcomePrice: row.outcome_price == null ? null : Number(row.outcome_price),
      outcomeDate: row.outcome_date,
      snapshot: row.snapshot || null
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/share', async (req, res, next) => {
  try {
    const groupId = String(req.body?.groupId || '').trim();
    if (!groupId) throw badRequest('groupId requerido', 'VALIDATION_ERROR');

    const alert = await query('SELECT id, symbol, recommendation, price_at_alert FROM alerts WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id
    ]);
    if (!alert.rows.length) throw notFound('Alerta no encontrada', 'ALERT_NOT_FOUND');

    const member = await query('SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, req.user.id]);
    if (!member.rows.length) throw forbidden('No sos miembro de este grupo', 'GROUP_ACCESS_DENIED');

    const inserted = await query(
      `INSERT INTO shared_alerts (alert_id, group_id, shared_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (alert_id, group_id) DO NOTHING
       RETURNING shared_at`,
      [req.params.id, groupId, req.user.id]
    );

    if (!inserted.rows.length) throw conflict('La alerta ya fue compartida en este grupo', 'ALREADY_SHARED');

    await query(
      `INSERT INTO group_events (group_id, user_id, type, data)
       VALUES ($1, $2, 'signal_shared', $3::jsonb)`,
      [
        groupId,
        req.user.id,
        JSON.stringify({
          alertId: req.params.id,
          symbol: alert.rows[0].symbol,
          recommendation: alert.rows[0].recommendation,
          priceAtShare: Number(alert.rows[0].price_at_alert)
        })
      ]
    );

    return res.json({ shared: true, sharedAt: inserted.rows[0].shared_at });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
