const express = require('express');
const { query } = require('../config/db');
const { badRequest } = require('../utils/errors');
const { regimeLabel, volatilityLabel, confidenceLabel } = require('../utils/regimeLabels');

const router = express.Router();

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (raw) => {
  const value = String(raw || '').trim();
  if (!ISO_DATE_RE.test(value)) throw badRequest('date inválida (YYYY-MM-DD)', 'VALIDATION_ERROR');
  return value;
};

const today = () => new Date().toISOString().slice(0, 10);

const toRegime = (row = {}) => ({
  regime: row.regime || null,
  regime_label: regimeLabel(row.regime),
  volatility_regime: row.volatility_regime || null,
  volatility_label: volatilityLabel(row.volatility_regime),
  leadership: Array.isArray(row.leadership) ? row.leadership : [],
  macro_drivers: Array.isArray(row.macro_drivers) ? row.macro_drivers : [],
  risk_flags: Array.isArray(row.risk_flags) ? row.risk_flags : [],
  confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
  confidence_label: confidenceLabel(row.confidence)
});

const handler = async (req, res, next, date) => {
  try {
    const [digestOut, regimeOut, crisisOut] = await Promise.all([
      query(
        `SELECT bullets, regime_summary, crisis_banner, themes, risk_flags, raw_structured
         FROM daily_digest
         WHERE user_id = $1 AND date = $2`,
        [req.user.id, date]
      ),
      query(
        `SELECT regime, volatility_regime, leadership, macro_drivers, risk_flags, confidence
         FROM regime_state WHERE date = $1`,
        [date]
      ),
      query(
        `SELECT is_active, triggers, summary, learn_more
         FROM crisis_state WHERE date = $1`,
        [date]
      )
    ]);

    const digest = digestOut.rows[0] || null;
    const regime = toRegime(regimeOut.rows[0] || {});
    const crisisActive = Boolean(crisisOut.rows?.[0]?.is_active);

    if (!digest) {
      return res.json({
        date,
        pending: true,
        message: "Today's digest will be available after market close."
      });
    }

    const rawStructured = digest.raw_structured && typeof digest.raw_structured === 'object' ? digest.raw_structured : {};
    const bullets = Array.isArray(digest.bullets) ? digest.bullets.slice(0, 10) : [];
    const keyRisks = Array.isArray(rawStructured.key_risks)
      ? rawStructured.key_risks.slice(0, 4)
      : Array.isArray(digest.risk_flags)
        ? digest.risk_flags.slice(0, 4)
        : regime.risk_flags.slice(0, 4);
    const macroDrivers = Array.isArray(rawStructured.macro_drivers)
      ? rawStructured.macro_drivers.slice(0, 3)
      : Array.isArray(regime.macro_drivers)
        ? regime.macro_drivers.slice(0, 3)
        : [];

    return res.json({
      date,
      regime: regime.regime,
      regime_label: regime.regime_label,
      volatility_regime: regime.volatility_regime,
      volatility_label: regime.volatility_label,
      confidence: regime.confidence,
      confidence_label: regime.confidence_label,
      leadership: regime.leadership,
      crisis_active: crisisActive,
      bullets,
      key_risks: keyRisks,
      macro_drivers: macroDrivers
    });
  } catch (error) {
    return next(error);
  }
};

router.get('/today', async (req, res, next) => handler(req, res, next, today()));
router.get('/:date', async (req, res, next) => handler(req, res, next, toDate(req.params.date)));

module.exports = router;
