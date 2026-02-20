const express = require('express');
const { query } = require('../config/db');
const { badRequest } = require('../utils/errors');

const router = express.Router();

const DEFAULT_PROFILE = {
  preset_type: 'balanced',
  risk_level: 0.5,
  horizon: 0.5,
  focus: 0.5
};

const PRESET_VALUES = new Set(['strategic_core', 'balanced', 'opportunistic']);

const toRange01 = (value, field) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw badRequest(`${field} debe estar entre 0 y 1`, 'VALIDATION_ERROR');
  }
  return n;
};

const toTags = (value, field) => {
  if (value == null) return [];
  if (!Array.isArray(value)) throw badRequest(`${field} debe ser un array`, 'VALIDATION_ERROR');
  return value
    .map((tag) => String(tag || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 30);
};

const serialize = (row = {}) => ({
  preset_type: String(row.preset_type || DEFAULT_PROFILE.preset_type),
  risk_level: Number(row.risk_level ?? DEFAULT_PROFILE.risk_level),
  horizon: Number(row.horizon ?? DEFAULT_PROFILE.horizon),
  focus: Number(row.focus ?? DEFAULT_PROFILE.focus)
});

router.get('/profile', async (req, res, next) => {
  try {
    const out = await query(
      `SELECT preset_type, risk_level, horizon, focus
       FROM user_agent_profile
       WHERE user_id = $1`,
      [req.user.id]
    );

    if (!out.rows.length) {
      const inserted = await query(
        `INSERT INTO user_agent_profile (user_id, preset_type, risk_level, horizon, focus, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
         RETURNING preset_type, risk_level, horizon, focus`,
        [
          req.user.id,
          DEFAULT_PROFILE.preset_type,
          DEFAULT_PROFILE.risk_level,
          DEFAULT_PROFILE.horizon,
          DEFAULT_PROFILE.focus
        ]
      );
      return res.json(serialize(inserted.rows[0]));
    }

    return res.json(serialize(out.rows[0]));
  } catch (error) {
    return next(error);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const presetType = req.body?.preset_type ?? req.body?.presetType ?? DEFAULT_PROFILE.preset_type;

    if (!PRESET_VALUES.has(String(presetType))) {
      throw badRequest('preset_type inválido', 'VALIDATION_ERROR');
    }

    const payload = {
      presetType: String(presetType),
      riskLevel: toRange01(req.body?.risk_level ?? req.body?.riskLevel ?? DEFAULT_PROFILE.risk_level, 'risk_level'),
      horizon: toRange01(req.body?.horizon ?? DEFAULT_PROFILE.horizon, 'horizon'),
      focus: toRange01(req.body?.focus ?? DEFAULT_PROFILE.focus, 'focus')
    };

    const out = await query(
      `INSERT INTO user_agent_profile (
        user_id, preset_type, risk_level, horizon, focus, preferred_tags, excluded_tags, notification_mode, updated_at
      ) VALUES ($1,$2,$3,$4,$5,COALESCE($6::jsonb,'[]'::jsonb),COALESCE($7::jsonb,'[]'::jsonb),COALESCE($8,'normal'),NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        preset_type = EXCLUDED.preset_type,
        risk_level = EXCLUDED.risk_level,
        horizon = EXCLUDED.horizon,
        focus = EXCLUDED.focus,
        updated_at = NOW()
      RETURNING preset_type, risk_level, horizon, focus`,
      [
        req.user.id,
        payload.presetType,
        payload.riskLevel,
        payload.horizon,
        payload.focus,
        JSON.stringify(toTags(req.body?.preferred_tags ?? req.body?.preferredTags, 'preferred_tags')),
        JSON.stringify(toTags(req.body?.excluded_tags ?? req.body?.excludedTags, 'excluded_tags')),
        req.body?.notification_mode ?? req.body?.notificationMode ?? 'normal'
      ]
    );

    return res.json(serialize(out.rows[0]));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
