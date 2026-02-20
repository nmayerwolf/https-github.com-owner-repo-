const { computeProfileMix, applyStrategyMixToRecommendations } = require('../src/services/profileFocus');

describe('profileFocus service', () => {
  test('changing focus changes strategic/opportunistic ratio', () => {
    const low = computeProfileMix(0.2);
    const high = computeProfileMix(0.8);

    expect(high.strategicRatio).toBeGreaterThan(low.strategicRatio);
    expect(high.opportunisticRatio).toBeLessThan(low.opportunisticRatio);
  });

  test('labels recommendations according to focus-driven strategic share', () => {
    const recommendations = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }];
    const lowFocus = applyStrategyMixToRecommendations(recommendations, 0.2);
    const highFocus = applyStrategyMixToRecommendations(recommendations, 0.8);

    const lowStrategic = lowFocus.filter((x) => x.strategyType === 'strategic').length;
    const highStrategic = highFocus.filter((x) => x.strategyType === 'strategic').length;
    expect(highStrategic).toBeGreaterThan(lowStrategic);
  });

  test('enforces max strategic/opportunistic caps from locked spec', () => {
    const recommendations = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1) }));
    const mixed = applyStrategyMixToRecommendations(recommendations, 0.5);

    const strategic = mixed.filter((x) => x.strategyType === 'strategic').length;
    const opportunistic = mixed.filter((x) => x.strategyType === 'opportunistic').length;

    expect(mixed.length).toBeLessThanOrEqual(7);
    expect(strategic).toBeLessThanOrEqual(4);
    expect(opportunistic).toBeLessThanOrEqual(3);
  });

  test('enforces max risk cap without breaking strategic/opportunistic caps', () => {
    const recommendations = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `s${i + 1}` })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `r${i + 1}`, strategyType: 'risk' }))
    ];
    const mixed = applyStrategyMixToRecommendations(recommendations, 0.6);

    const strategic = mixed.filter((x) => x.strategyType === 'strategic').length;
    const opportunistic = mixed.filter((x) => x.strategyType === 'opportunistic').length;
    const risk = mixed.filter((x) => x.strategyType === 'risk').length;

    expect(strategic).toBeLessThanOrEqual(4);
    expect(opportunistic).toBeLessThanOrEqual(3);
    expect(risk).toBeLessThanOrEqual(4);
  });
});
