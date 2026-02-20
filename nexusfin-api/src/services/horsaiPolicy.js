const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clampRisk = (riskLevel) => clamp(toNum(riskLevel, 0.5), 0, 1);

const computeRaiWeights = ({ riskLevel = 0.5, regime = 'transition', volatilityRegime = 'normal', confidence = 0 } = {}) => {
  const safeRisk = clampRisk(riskLevel);

  let alpha = 0.40 + (safeRisk - 0.5) * 0.10;
  let beta = 0.40 - (safeRisk - 0.5) * 0.10;
  const gamma = 0.20;

  alpha = clamp(alpha, 0.35, 0.45);
  beta = clamp(beta, 0.35, 0.45);

  if (String(volatilityRegime) === 'crisis') {
    alpha = Math.max(alpha - 0.05, 0.30);
    beta = Math.min(beta + 0.05, 0.50);
  }

  if (String(regime) === 'risk_on' && toNum(confidence) >= 0.75 && String(volatilityRegime) === 'normal') {
    alpha = Math.min(alpha + 0.03, 0.48);
    beta = Math.max(beta - 0.03, 0.32);
  }

  return {
    alpha: Number(alpha.toFixed(4)),
    beta: Number(beta.toFixed(4)),
    gamma
  };
};

const computeRai = ({ deltaReturn = 0, deltaVolatility = 0, deltaDrawdown = 0, weights = null, profile = null } = {}) => {
  const activeWeights =
    weights ||
    computeRaiWeights({
      riskLevel: profile?.riskLevel,
      regime: profile?.regime,
      volatilityRegime: profile?.volatilityRegime,
      confidence: profile?.confidence
    });

  const rai =
    activeWeights.alpha * toNum(deltaReturn) +
    activeWeights.beta * toNum(deltaVolatility) +
    activeWeights.gamma * toNum(deltaDrawdown);

  return {
    rai: Number(rai.toFixed(6)),
    weights: activeWeights
  };
};

const resolveSuggestionLevel = ({ score = 50, volatilityRegime = 'normal' } = {}) => {
  const s = toNum(score, 50);
  if (s < 25 || (String(volatilityRegime) === 'crisis' && s < 35)) return 3;
  if (s >= 25 && s < 40) return 2;
  if (s >= 40 && s <= 60) return 1;
  return 0;
};

const canSuggestSpecificAssets = ({ confidence = 0, regime = 'transition', materialImpact = false } = {}) =>
  toNum(confidence) >= 0.75 && ['risk_on', 'risk_off'].includes(String(regime)) && Boolean(materialImpact);

const cooldownDaysForAction = ({ action = 'acknowledge', dismissStreak = 0 } = {}) => {
  const normalized = String(action).toLowerCase();
  if (normalized === 'acknowledge') return 7;
  if (normalized === 'dismiss') return toNum(dismissStreak, 0) >= 3 ? 21 : 14;
  return 0;
};

const shouldReactivateSignal = ({
  previousScore = null,
  currentScore = null,
  previousRegime = null,
  currentRegime = null,
  previousVolatilityRegime = null,
  currentVolatilityRegime = null,
  consecutiveDisplayDays = 0
} = {}) => {
  const prev = toNum(previousScore, null);
  const curr = toNum(currentScore, null);
  const worsenedBy10 = Number.isFinite(prev) && Number.isFinite(curr) ? prev - curr >= 10 : false;
  const regimeChanged = Boolean(previousRegime && currentRegime && previousRegime !== currentRegime);
  const crisisActivated = String(previousVolatilityRegime) !== 'crisis' && String(currentVolatilityRegime) === 'crisis';
  const overDisplayCap = toNum(consecutiveDisplayDays, 0) >= 3;

  return {
    shouldReactivate: worsenedBy10 || regimeChanged || crisisActivated,
    forcedCooldownDays: overDisplayCap ? 5 : 0,
    reasons: {
      worsenedBy10,
      regimeChanged,
      crisisActivated,
      overDisplayCap
    }
  };
};

module.exports = {
  computeRai,
  computeRaiWeights,
  resolveSuggestionLevel,
  canSuggestSpecificAssets,
  cooldownDaysForAction,
  shouldReactivateSignal
};
