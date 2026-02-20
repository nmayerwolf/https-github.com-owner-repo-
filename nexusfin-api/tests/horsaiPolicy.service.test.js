const {
  computeRai,
  computeRaiWeights,
  resolveSuggestionLevel,
  canSuggestSpecificAssets,
  cooldownDaysForAction,
  shouldReactivateSignal
} = require('../src/services/horsaiPolicy');

describe('horsaiPolicy', () => {
  it('computes base profile-adjusted weights within limits', () => {
    const out = computeRaiWeights({ riskLevel: 1, regime: 'transition', volatilityRegime: 'normal', confidence: 0.6 });

    expect(out.alpha).toBeLessThanOrEqual(0.45);
    expect(out.alpha).toBeGreaterThanOrEqual(0.35);
    expect(out.beta).toBeLessThanOrEqual(0.45);
    expect(out.beta).toBeGreaterThanOrEqual(0.35);
    expect(out.gamma).toBe(0.2);
  });

  it('applies crisis and strong risk-on overrides', () => {
    const crisis = computeRaiWeights({ riskLevel: 0.7, regime: 'risk_off', volatilityRegime: 'crisis', confidence: 0.9 });
    expect(crisis.alpha).toBeGreaterThanOrEqual(0.3);
    expect(crisis.beta).toBeLessThanOrEqual(0.5);

    const riskOn = computeRaiWeights({ riskLevel: 0.6, regime: 'risk_on', volatilityRegime: 'normal', confidence: 0.8 });
    expect(riskOn.alpha).toBeLessThanOrEqual(0.48);
    expect(riskOn.beta).toBeGreaterThanOrEqual(0.32);
  });

  it('computes RAI with normalized deltas', () => {
    const out = computeRai({
      deltaReturn: 0.2,
      deltaVolatility: 0.1,
      deltaDrawdown: 0.05,
      profile: { riskLevel: 0.5, regime: 'transition', volatilityRegime: 'normal', confidence: 0.6 }
    });

    expect(out.rai).toBeCloseTo(0.13, 3);
  });

  it('resolves escalation levels according to score and crisis override', () => {
    expect(resolveSuggestionLevel({ score: 55, volatilityRegime: 'normal' })).toBe(1);
    expect(resolveSuggestionLevel({ score: 30, volatilityRegime: 'normal' })).toBe(2);
    expect(resolveSuggestionLevel({ score: 24, volatilityRegime: 'normal' })).toBe(3);
    expect(resolveSuggestionLevel({ score: 34, volatilityRegime: 'crisis' })).toBe(3);
  });

  it('enforces specific-asset eligibility gates', () => {
    expect(canSuggestSpecificAssets({ confidence: 0.8, regime: 'risk_on', materialImpact: true })).toBe(true);
    expect(canSuggestSpecificAssets({ confidence: 0.7, regime: 'risk_on', materialImpact: true })).toBe(false);
    expect(canSuggestSpecificAssets({ confidence: 0.8, regime: 'transition', materialImpact: true })).toBe(false);
  });

  it('computes cooldown and reactivation controls', () => {
    expect(cooldownDaysForAction({ action: 'acknowledge' })).toBe(7);
    expect(cooldownDaysForAction({ action: 'dismiss', dismissStreak: 1 })).toBe(14);
    expect(cooldownDaysForAction({ action: 'dismiss', dismissStreak: 3 })).toBe(21);

    const reactivate = shouldReactivateSignal({
      previousScore: 60,
      currentScore: 49,
      previousRegime: 'risk_on',
      currentRegime: 'risk_on',
      previousVolatilityRegime: 'normal',
      currentVolatilityRegime: 'normal',
      consecutiveDisplayDays: 3
    });

    expect(reactivate.shouldReactivate).toBe(true);
    expect(reactivate.forcedCooldownDays).toBe(5);
  });
});
