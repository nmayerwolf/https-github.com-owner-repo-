const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeFocus = (value, fallback = 0.5) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return clamp(fallback, 0, 1);
  return clamp(parsed, 0, 1);
};

const deriveFocusFromConfig = (config = {}) => {
  const rawFocus = config?.focusSlider ?? config?.focus_slider ?? config?.focus;
  if (rawFocus !== undefined && rawFocus !== null && rawFocus !== '') {
    return normalizeFocus(rawFocus);
  }

  const risk = String(config?.risk_profile || config?.riskProfile || 'moderado').toLowerCase();
  if (risk === 'conservador') return 0.8;
  if (risk === 'agresivo') return 0.35;
  return 0.55;
};

const computeProfileMix = (focusValue) => {
  const focus = normalizeFocus(focusValue);
  // Locked spec formula: targetStrategicShare = 0.2 + (0.6 * focus)
  const strategicRatio = Number((0.2 + 0.6 * focus).toFixed(2));
  const opportunisticRatio = Number((1 - strategicRatio).toFixed(2));
  return { focus, strategicRatio, opportunisticRatio };
};

const applyStrategyMixToRecommendations = (recommendations = [], focusValue = 0.5) => {
  const items = Array.isArray(recommendations) ? recommendations : [];
  if (!items.length) return [];

  const mix = computeProfileMix(focusValue);
  const strategicCount = clamp(Math.round(items.length * mix.strategicRatio), 1, items.length);

  return items.map((rec, idx) => ({
    ...rec,
    strategyType: idx < strategicCount ? 'strategic' : 'opportunistic'
  }));
};

module.exports = {
  normalizeFocus,
  deriveFocusFromConfig,
  computeProfileMix,
  applyStrategyMixToRecommendations
};
