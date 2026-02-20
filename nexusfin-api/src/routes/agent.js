const express = require('express');
const { query } = require('../config/db');
const { badRequest } = require('../utils/errors');

const router = express.Router();

const DEFAULT_PROFILE = {
  presetType: 'balanced',
  riskLevel: 0.5,
  horizon: 0.5,
  focus: 0.5,
  preferredTags: [],
  excludedTags: [],
  notificationMode: 'normal'
};

const PRESET_VALUES = new Set(['strategic_core', 'balanced', 'opportunistic']);
const NOTIFICATION_VALUES = new Set(['normal', 'digest_only']);

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
  presetType: String(row.preset_type || DEFAULT_PROFILE.presetType),
  riskLevel: Number(row.risk_level ?? DEFAULT_PROFILE.riskLevel),
  horizon: Number(row.horizon ?? DEFAULT_PROFILE.horizon),
  focus: Number(row.focus ?? DEFAULT_PROFILE.focus),
  preferredTags: Array.isArray(row.preferred_tags) ? row.preferred_tags : DEFAULT_PROFILE.preferredTags,
  excludedTags: Array.isArray(row.excluded_tags) ? row.excluded_tags : DEFAULT_PROFILE.excludedTags,
  notificationMode: String(row.notification_mode || DEFAULT_PROFILE.notificationMode),
  updatedAt: row.updated_at || null
});

router.get('/profile', async (req, res, next) => {
  try {
    const out = await query(
      `SELECT preset_type, risk_level, horizon, focus, preferred_tags, excluded_tags, notification_mode, updated_at
       FROM user_agent_profile
       WHERE user_id = $1`,
      [req.user.id]
    );

    if (!out.rows.length) {
      return res.json({ ...DEFAULT_PROFILE, updatedAt: null });
    }

    return res.json(serialize(out.rows[0]));
  } catch (error) {
    return next(error);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const presetType = req.body?.preset_type ?? req.body?.presetType ?? DEFAULT_PROFILE.presetType;
    const notificationMode = req.body?.notification_mode ?? req.body?.notificationMode ?? DEFAULT_PROFILE.notificationMode;

    if (!PRESET_VALUES.has(String(presetType))) {
      throw badRequest('preset_type inválido', 'VALIDATION_ERROR');
    }
    if (!NOTIFICATION_VALUES.has(String(notificationMode))) {
      throw badRequest('notification_mode inválido', 'VALIDATION_ERROR');
    }

    const payload = {
      presetType: String(presetType),
      riskLevel: toRange01(req.body?.risk_level ?? req.body?.riskLevel ?? DEFAULT_PROFILE.riskLevel, 'risk_level'),
      horizon: toRange01(req.body?.horizon ?? DEFAULT_PROFILE.horizon, 'horizon'),
      focus: toRange01(req.body?.focus ?? DEFAULT_PROFILE.focus, 'focus'),
      preferredTags: toTags(req.body?.preferred_tags ?? req.body?.preferredTags, 'preferred_tags'),
      excludedTags: toTags(req.body?.excluded_tags ?? req.body?.excludedTags, 'excluded_tags'),
      notificationMode: String(notificationMode)
    };

    const out = await query(
      `INSERT INTO user_agent_profile (
        user_id, preset_type, risk_level, horizon, focus, preferred_tags, excluded_tags, notification_mode, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        preset_type = EXCLUDED.preset_type,
        risk_level = EXCLUDED.risk_level,
        horizon = EXCLUDED.horizon,
        focus = EXCLUDED.focus,
        preferred_tags = EXCLUDED.preferred_tags,
        excluded_tags = EXCLUDED.excluded_tags,
        notification_mode = EXCLUDED.notification_mode,
        updated_at = NOW()
      RETURNING preset_type, risk_level, horizon, focus, preferred_tags, excluded_tags, notification_mode, updated_at`,
      [
        req.user.id,
        payload.presetType,
        payload.riskLevel,
        payload.horizon,
        payload.focus,
        JSON.stringify(payload.preferredTags),
        JSON.stringify(payload.excludedTags),
        payload.notificationMode
      ]
    );

    return res.json(serialize(out.rows[0]));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
