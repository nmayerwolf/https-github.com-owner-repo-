const { createMvpNarrativeService, extractJsonObject } = require('../src/services/mvpNarrative');

describe('mvpNarrative service', () => {
  test('extractJsonObject parses JSON embedded in text', () => {
    const parsed = extractJsonObject('noise {"ok":true,"x":1} trailing');
    expect(parsed).toEqual({ ok: true, x: 1 });
  });

  test('digest fallback returns trimmed bullets when AI is disabled', async () => {
    const service = createMvpNarrativeService({ enabled: false, apiKey: '' });
    const out = await service.polishDigestBullets({
      profile: { preset_type: 'balanced', risk_level: 0.5, horizon: 0.5, focus: 0.5 },
      regimeState: { regime: 'risk_on', volatilityRegime: 'normal', leadership: ['mega_cap_tech'], riskFlags: ['vol'], confidence: 0.7 },
      crisisState: { isActive: false, triggers: [] },
      bullets: ['Regime Today: Risk-on (70% confidence).', 'Leadership/themes: mega_cap_tech.', 'Key risks: vol.']
    });

    expect(out.meta.mode).toBe('fallback');
    expect(Array.isArray(out.bullets)).toBe(true);
    expect(out.bullets.length).toBeGreaterThan(0);
  });

  test('recommendations fallback keeps canonical rationale/risks limits', async () => {
    const service = createMvpNarrativeService({ enabled: false, apiKey: '' });
    const out = await service.polishRecommendationItems({
      profile: { preset_type: 'strategic_core', risk_level: 0.3, horizon: 0.7, focus: 0.2 },
      regimeState: { regime: 'risk_off', volatilityRegime: 'elevated', leadership: ['defensives'], riskFlags: ['credit'], confidence: 0.75 },
      crisisState: { isActive: true, triggers: ['volatility_regime=elevated'] },
      items: [
        {
          ideaId: 'str-aapl-2026-02-20',
          category: 'strategic',
          action: 'BUY',
          confidence: 0.72,
          rationale: ['a', 'b', 'c', 'd'],
          risks: ['r1', 'r2', 'r3']
        }
      ]
    });

    expect(out.meta.mode).toBe('fallback');
    expect(out.items).toHaveLength(1);
    expect(out.items[0].rationale).toHaveLength(3);
    expect(out.items[0].risks).toHaveLength(2);
  });
});
