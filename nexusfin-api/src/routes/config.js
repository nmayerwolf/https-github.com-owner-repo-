const express = require('express');
const { query } = require('../config/db');
const { badRequest } = require('../utils/errors');

const router = express.Router();

const ALLOWED_RISK = ['conservador', 'moderado', 'agresivo'];
const ALLOWED_HORIZON = ['corto', 'mediano', 'largo'];
const ALLOWED_SECTORS = ['tech', 'finance', 'health', 'energy', 'auto', 'crypto', 'metals', 'bonds', 'fx'];

const defaults = {
  risk_profile: 'moderado',
  horizon: 'mediano',
  sectors: ['tech', 'crypto', 'metals'],
  max_pe: 50,
  min_div_yield: 0,
  min_mkt_cap: 100,
  rsi_os: 30,
  rsi_ob: 70,
  vol_thresh: 2,
  min_confluence: 2
};

const toApi = (row) => ({
  riskProfile: row.risk_profile,
  horizon: row.horizon,
  sectors: row.sectors,
  maxPE: Number(row.max_pe),
  minDivYield: Number(row.min_div_yield),
  minMktCap: Number(row.min_mkt_cap),
  rsiOS: row.rsi_os,
  rsiOB: row.rsi_ob,
  volThresh: Number(row.vol_thresh),
  minConfluence: row.min_confluence
});

const assertNumberInRange = (value, key, min, max) => {
  if (value === undefined) return;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw badRequest(`${key} fuera de rango`, 'VALIDATION_ERROR');
  }
};

const validateInput = (input) => {
  if (input.riskProfile !== undefined && !ALLOWED_RISK.includes(input.riskProfile)) {
    throw badRequest('riskProfile inválido', 'VALIDATION_ERROR');
  }

  if (input.horizon !== undefined && !ALLOWED_HORIZON.includes(input.horizon)) {
    throw badRequest('horizon inválido', 'VALIDATION_ERROR');
  }

  if (input.sectors !== undefined) {
    if (!Array.isArray(input.sectors)) {
      throw badRequest('sectors debe ser un array', 'VALIDATION_ERROR');
    }

    const invalidSector = input.sectors.find((s) => !ALLOWED_SECTORS.includes(s));
    if (invalidSector) {
      throw badRequest(`sector inválido: ${invalidSector}`, 'VALIDATION_ERROR');
    }
  }

  assertNumberInRange(input.maxPE, 'maxPE', 10, 100);
  assertNumberInRange(input.minDivYield, 'minDivYield', 0, 5);
  assertNumberInRange(input.minMktCap, 'minMktCap', 0, 1000);
  assertNumberInRange(input.rsiOS, 'rsiOS', 15, 40);
  assertNumberInRange(input.rsiOB, 'rsiOB', 60, 85);
  assertNumberInRange(input.volThresh, 'volThresh', 1.2, 4);
  assertNumberInRange(input.minConfluence, 'minConfluence', 1, 5);
};

router.get('/', async (req, res, next) => {
  try {
    const found = await query('SELECT * FROM user_configs WHERE user_id = $1', [req.user.id]);
    if (!found.rows.length) return res.json(toApi(defaults));
    return res.json(toApi(found.rows[0]));
  } catch (error) {
    return next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const input = req.body || {};
    validateInput(input);

    const current = await query('SELECT * FROM user_configs WHERE user_id = $1', [req.user.id]);
    const base = current.rows[0] || defaults;

    const merged = {
      risk_profile: input.riskProfile ?? base.risk_profile,
      horizon: input.horizon ?? base.horizon,
      sectors: input.sectors ?? base.sectors,
      max_pe: input.maxPE ?? base.max_pe,
      min_div_yield: input.minDivYield ?? base.min_div_yield,
      min_mkt_cap: input.minMktCap ?? base.min_mkt_cap,
      rsi_os: input.rsiOS ?? base.rsi_os,
      rsi_ob: input.rsiOB ?? base.rsi_ob,
      vol_thresh: input.volThresh ?? base.vol_thresh,
      min_confluence: input.minConfluence ?? base.min_confluence
    };

    const saved = await query(
      `INSERT INTO user_configs
       (user_id, risk_profile, horizon, sectors, max_pe, min_div_yield, min_mkt_cap, rsi_os, rsi_ob, vol_thresh, min_confluence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (user_id)
       DO UPDATE SET
         risk_profile=EXCLUDED.risk_profile,
         horizon=EXCLUDED.horizon,
         sectors=EXCLUDED.sectors,
         max_pe=EXCLUDED.max_pe,
         min_div_yield=EXCLUDED.min_div_yield,
         min_mkt_cap=EXCLUDED.min_mkt_cap,
         rsi_os=EXCLUDED.rsi_os,
         rsi_ob=EXCLUDED.rsi_ob,
         vol_thresh=EXCLUDED.vol_thresh,
         min_confluence=EXCLUDED.min_confluence,
         updated_at=NOW()
       RETURNING *`,
      [
        req.user.id,
        merged.risk_profile,
        merged.horizon,
        merged.sectors,
        merged.max_pe,
        merged.min_div_yield,
        merged.min_mkt_cap,
        merged.rsi_os,
        merged.rsi_ob,
        merged.vol_thresh,
        merged.min_confluence
      ]
    );

    return res.json(toApi(saved.rows[0]));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
