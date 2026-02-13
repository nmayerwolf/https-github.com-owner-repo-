const express = require('express');
const { query } = require('../config/db');
const { badRequest, notFound } = require('../utils/errors');

const router = express.Router();

const isBoolean = (v) => typeof v === 'boolean';
const validTime = (v) => v == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v));

router.post('/subscribe', async (req, res, next) => {
  try {
    const { platform } = req.body || {};
    if (!['web', 'ios', 'android'].includes(platform)) {
      throw badRequest('Plataforma inválida', 'VALIDATION_ERROR');
    }

    let payload;
    if (platform === 'web') {
      if (!req.body?.subscription?.endpoint) {
        throw badRequest('Subscription web inválida', 'VALIDATION_ERROR');
      }
      payload = req.body.subscription;
    } else {
      const token = String(req.body?.expoPushToken || '').trim();
      if (!token) throw badRequest('expoPushToken requerido', 'VALIDATION_ERROR');
      payload = { expoPushToken: token };
    }

    const out = await query(
      `INSERT INTO push_subscriptions (user_id, platform, subscription, active)
       VALUES ($1, $2, $3::jsonb, true)
       RETURNING id, platform, active`,
      [req.user.id, platform, JSON.stringify(payload)]
    );

    return res.status(201).json(out.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.get('/preferences', async (req, res, next) => {
  try {
    const out = await query(
      `SELECT stop_loss, opportunities, group_activity, quiet_hours_start, quiet_hours_end
       FROM notification_preferences WHERE user_id = $1`,
      [req.user.id]
    );

    if (!out.rows.length) {
      return res.json({
        stopLoss: true,
        opportunities: true,
        groupActivity: true,
        quietHoursStart: null,
        quietHoursEnd: null
      });
    }

    const row = out.rows[0];
    return res.json({
      stopLoss: row.stop_loss,
      opportunities: row.opportunities,
      groupActivity: row.group_activity,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/preferences', async (req, res, next) => {
  try {
    const updates = req.body || {};

    if (updates.stopLoss !== undefined && !isBoolean(updates.stopLoss)) throw badRequest('stopLoss inválido', 'VALIDATION_ERROR');
    if (updates.opportunities !== undefined && !isBoolean(updates.opportunities))
      throw badRequest('opportunities inválido', 'VALIDATION_ERROR');
    if (updates.groupActivity !== undefined && !isBoolean(updates.groupActivity))
      throw badRequest('groupActivity inválido', 'VALIDATION_ERROR');

    if (!validTime(updates.quietHoursStart) || !validTime(updates.quietHoursEnd)) {
      throw badRequest('Formato de quiet hours inválido (HH:MM)', 'VALIDATION_ERROR');
    }

    await query(
      `INSERT INTO notification_preferences (user_id, stop_loss, opportunities, group_activity, quiet_hours_start, quiet_hours_end, updated_at)
       VALUES ($1, COALESCE($2, true), COALESCE($3, true), COALESCE($4, true), $5, $6, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         stop_loss = COALESCE($2, notification_preferences.stop_loss),
         opportunities = COALESCE($3, notification_preferences.opportunities),
         group_activity = COALESCE($4, notification_preferences.group_activity),
         quiet_hours_start = CASE WHEN $5::text IS NULL THEN notification_preferences.quiet_hours_start ELSE $5 END,
         quiet_hours_end = CASE WHEN $6::text IS NULL THEN notification_preferences.quiet_hours_end ELSE $6 END,
         updated_at = NOW()`,
      [
        req.user.id,
        updates.stopLoss,
        updates.opportunities,
        updates.groupActivity,
        updates.quietHoursStart ?? null,
        updates.quietHoursEnd ?? null
      ]
    );

    const out = await query(
      `SELECT stop_loss, opportunities, group_activity, quiet_hours_start, quiet_hours_end
       FROM notification_preferences WHERE user_id = $1`,
      [req.user.id]
    );

    const row = out.rows[0];
    return res.json({
      stopLoss: row.stop_loss,
      opportunities: row.opportunities,
      groupActivity: row.group_activity,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/subscribe/:id', async (req, res, next) => {
  try {
    const out = await query(
      `UPDATE push_subscriptions
       SET active = false
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (!out.rows.length) throw notFound('Suscripción no encontrada', 'SUBSCRIPTION_NOT_FOUND');
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
