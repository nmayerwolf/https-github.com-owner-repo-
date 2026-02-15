const ALERT_TYPES = ['opportunity', 'bearish', 'stop_loss'];
const ALERT_OUTCOMES = ['win', 'loss', 'open'];
const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];

const RISK_PROFILES = ['conservador', 'moderado', 'agresivo'];
const HORIZONS = ['corto', 'mediano', 'largo'];
const SECTORS = ['tech', 'finance', 'health', 'energy', 'auto', 'crypto', 'metals', 'bonds', 'fx'];

const toNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeConfidence = (value, fallback = 'medium') => {
  const out = String(value || fallback).toLowerCase();
  return CONFIDENCE_LEVELS.includes(out) ? out : fallback;
};

const normalizeAlertOutcome = (value) => {
  const out = String(value || 'open').toLowerCase();
  return ALERT_OUTCOMES.includes(out) ? out : 'open';
};

const normalizeAlertSummary = (row) => ({
  id: row.id,
  symbol: row.symbol,
  name: row.name,
  type: ALERT_TYPES.includes(row.type) ? row.type : 'opportunity',
  recommendation: row.recommendation,
  confidence: normalizeConfidence(row.confidence, 'medium'),
  confluenceBull: toNumberOrNull(row.confluence_bull) ?? 0,
  confluenceBear: toNumberOrNull(row.confluence_bear) ?? 0,
  signals: Array.isArray(row.signals) ? row.signals : [],
  priceAtAlert: toNumberOrNull(row.price_at_alert) ?? 0,
  stopLoss: toNumberOrNull(row.stop_loss),
  takeProfit: toNumberOrNull(row.take_profit),
  currentPrice: null,
  priceChange: null,
  outcome: normalizeAlertOutcome(row.outcome),
  aiThesis: row.ai_thesis || null,
  createdAt: row.created_at,
  notified: !!row.notified
});

module.exports = {
  ALERT_TYPES,
  ALERT_OUTCOMES,
  CONFIDENCE_LEVELS,
  RISK_PROFILES,
  HORIZONS,
  SECTORS,
  normalizeConfidence,
  normalizeAlertOutcome,
  normalizeAlertSummary
};
