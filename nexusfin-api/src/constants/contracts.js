const ALERT_TYPES = ['opportunity', 'bearish', 'stop_loss'];
const ALERT_OUTCOMES = ['win', 'loss', 'open'];
const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];

const RISK_PROFILES = ['conservador', 'moderado', 'agresivo'];
const HORIZONS = ['corto', 'mediano', 'largo'];
const SECTORS = ['tech', 'finance', 'health', 'energy', 'auto', 'crypto', 'metals', 'bonds', 'fx'];
const CONFIG_NUMERIC_RANGES = {
  maxPE: [10, 100],
  minDivYield: [0, 5],
  minMktCap: [0, 1000],
  rsiOS: [15, 40],
  rsiOB: [60, 85],
  volThresh: [1.2, 4],
  minConfluence: [1, 5]
};

const DEFAULT_USER_CONFIG = {
  riskProfile: 'moderado',
  horizon: 'mediano',
  sectors: ['tech', 'crypto', 'metals'],
  maxPE: 50,
  minDivYield: 0,
  minMktCap: 100,
  rsiOS: 30,
  rsiOB: 70,
  volThresh: 2,
  minConfluence: 2
};

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

const HORSAI_MARKET_LABELS = {
  risk_on: 'Supportive',
  risk_off: 'Defensive',
  transition: 'Mixed',
  normal: 'Calm',
  elevated: 'Increasing',
  crisis: 'High Uncertainty'
};

const normalizeHorsaiSignalReview = (row = {}) => ({
  signalsAffectingPortfolio: toNumberOrNull(row.signalsAffectingPortfolio) ?? 0,
  riskReductionCases: toNumberOrNull(row.riskReductionCases) ?? 0,
  avgVolatilityReductionPct: toNumberOrNull(row.avgVolatilityReductionPct) ?? 0,
  performanceImprovementCases: toNumberOrNull(row.performanceImprovementCases) ?? 0,
  avgRelativeImpactPct: toNumberOrNull(row.avgRelativeImpactPct) ?? 0,
  outcomes:
    row.outcomes && typeof row.outcomes === 'object'
      ? {
          favorable: toNumberOrNull(row.outcomes.favorable) ?? 0,
          neutral: toNumberOrNull(row.outcomes.neutral) ?? 0,
          adverse: toNumberOrNull(row.outcomes.adverse) ?? 0
        }
      : { favorable: 0, neutral: 0, adverse: 0 }
});

const validateUserConfigInput = (input = {}) => {
  if (input.riskProfile !== undefined && !RISK_PROFILES.includes(input.riskProfile)) return 'riskProfile inválido';
  if (input.horizon !== undefined && !HORIZONS.includes(input.horizon)) return 'horizon inválido';
  if (input.sectors !== undefined) {
    if (!Array.isArray(input.sectors)) return 'sectors debe ser un array';
    const invalid = input.sectors.find((s) => !SECTORS.includes(s));
    if (invalid) return `sector inválido: ${invalid}`;
  }

  for (const [key, [min, max]] of Object.entries(CONFIG_NUMERIC_RANGES)) {
    const value = input[key];
    if (value === undefined) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) return `${key} fuera de rango`;
  }

  return null;
};

module.exports = {
  ALERT_TYPES,
  ALERT_OUTCOMES,
  CONFIDENCE_LEVELS,
  RISK_PROFILES,
  HORIZONS,
  SECTORS,
  CONFIG_NUMERIC_RANGES,
  DEFAULT_USER_CONFIG,
  normalizeConfidence,
  normalizeAlertOutcome,
  normalizeAlertSummary,
  HORSAI_MARKET_LABELS,
  normalizeHorsaiSignalReview,
  validateUserConfigInput
};
