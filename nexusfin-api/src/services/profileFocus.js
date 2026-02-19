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

  const MAX_STRATEGIC = 4;
  const MAX_OPPORTUNISTIC = 3;
  const MAX_RISK = 4;
  const isRiskRecommendation = (rec = {}) => {
    const strategyType = String(rec?.strategyType || '').toLowerCase();
    const category = String(rec?.category || '').toLowerCase();
    const type = String(rec?.type || '').toLowerCase();
    return strategyType === 'risk' || category === 'risk' || type === 'risk';
  };

  const riskItems = items.filter(isRiskRecommendation).slice(0, MAX_RISK);
  const nonRiskItems = items.filter((rec) => !isRiskRecommendation(rec));
  const cappedItems = nonRiskItems.slice(0, MAX_STRATEGIC + MAX_OPPORTUNISTIC);

  const mix = computeProfileMix(focusValue);
  const total = cappedItems.length;
  const minStrategic = total > 0 ? Math.max(1, total - MAX_OPPORTUNISTIC) : 0;
  const maxStrategic = Math.min(MAX_STRATEGIC, total);
  const strategicCount = clamp(Math.round(total * mix.strategicRatio), minStrategic, maxStrategic);

  const mixed = cappedItems.map((rec, idx) => ({
    ...rec,
    strategyType: idx < strategicCount ? 'strategic' : 'opportunistic'
  }));

  return [...mixed, ...riskItems.map((rec) => ({ ...rec, strategyType: 'risk' }))];
};

module.exports = {
  normalizeFocus,
  deriveFocusFromConfig,
  computeProfileMix,
  applyStrategyMixToRecommendations
};
