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
});
