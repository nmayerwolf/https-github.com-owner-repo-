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
  volatilityRegime: row.volatility_regime || null,
  volatility_label: volatilityLabel(row.volatility_regime),
  leadership: Array.isArray(row.leadership) ? row.leadership : [],
  macroDrivers: Array.isArray(row.macro_drivers) ? row.macro_drivers : [],
  riskFlags: Array.isArray(row.risk_flags) ? row.risk_flags : [],
  confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
  confidence_label: confidenceLabel(row.confidence)
});

const normalizeItem = (row = {}) => {
  const category = row.category || 'strategic';
  if (category === 'risk') {
    return {
      category: 'risk',
      severity: row.severity || 'medium',
      title: row.title || 'Risk Alert',
      bullets: Array.isArray(row.bullets)
        ? row.bullets.slice(0, 3)
        : Array.isArray(row.rationale)
          ? row.rationale.slice(0, 3)
          : [],
      tags: Array.isArray(row.tags) ? row.tags : []
    };
  }

  const out = {
    ideaId: String(row.ideaId || row.idea_id || ''),
    symbol: row.symbol || null,
    action: row.action || 'WATCH',
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0,
    timeframe: row.timeframe || 'weeks',
    invalidation: row.invalidation || null,
    rationale: Array.isArray(row.rationale) ? row.rationale.slice(0, 3) : [],
    risks: Array.isArray(row.risks) ? row.risks.slice(0, 2) : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    category,
    severity: row.severity || null
  };

  if (category === 'opportunistic') {
    out.opportunisticType = row.opportunisticType || row.opportunistic_type || null;
  }

  return out;
};

const splitSections = (items = [], isCrisis = false) => {
  const normalized = items.map(normalizeItem).filter((item) => item.category === 'risk' || item.ideaId || item.symbol);
  const strategic = normalized.filter((item) => item.category === 'strategic');
  const opportunistic = normalized.filter((item) => item.category === 'opportunistic');
  const riskAlerts = normalized.filter((item) => item.category === 'risk');

  if (isCrisis) {
    return {
      strategic: strategic.slice(0, 2),
      opportunistic: opportunistic.slice(0, 1),
      risk_alerts: riskAlerts.slice(0, 4)
    };
  }

  return {
    strategic: strategic.slice(0, 4),
    opportunistic: opportunistic.slice(0, 3),
    risk_alerts: riskAlerts.slice(0, 4)
  };
};

const loadItems = async (userId, date) => {
  const userOut = await query('SELECT items FROM user_recommendations WHERE user_id = $1 AND date = $2', [userId, date]);
  if (userOut.rows.length) {
    const items = Array.isArray(userOut.rows[0].items) ? userOut.rows[0].items : [];
    if (items.length) return items;
  }

  const baseOut = await query(
    `SELECT idea_id, symbol, action, confidence, timeframe, invalidation, rationale, risks, tags, category, opportunistic_type, severity
     FROM base_ideas
     WHERE date = $1
     ORDER BY confidence DESC NULLS LAST, idea_id ASC`,
    [date]
  );

  return baseOut.rows;
};

const handler = async (req, res, next, date) => {
  try {
    const [items, regimeOut, crisisOut] = await Promise.all([
      loadItems(req.user.id, date),
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

    if (!items.length) {
      return res.json({
        date,
        pending: true,
        message: "Today's recommendations will be available after market close."
      });
    }

    const crisisActive = Boolean(crisisOut.rows?.[0]?.is_active);
    const sections = splitSections(items, crisisActive);
    const regime = toRegime(regimeOut.rows[0] || {});

    return res.json({
      date,
      regime: regime.regime,
      regime_label: regime.regime_label,
      volatility_regime: regime.volatilityRegime,
      volatility_label: regime.volatility_label,
      confidence: regime.confidence,
      confidence_label: regime.confidence_label,
      leadership: regime.leadership,
      crisis_active: crisisActive,
      strategic: sections.strategic,
      opportunistic: sections.opportunistic,
      risk_alerts: sections.risk_alerts
    });
  } catch (error) {
    return next(error);
  }
};

router.get('/today', async (req, res, next) => handler(req, res, next, today()));
router.get('/:date', async (req, res, next) => handler(req, res, next, toDate(req.params.date)));

module.exports = router;
