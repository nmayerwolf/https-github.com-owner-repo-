const { REGIME_ENUM, VOLATILITY_REGIME_ENUM, computeRegime } = require('../src/services/regime');

describe('regime service', () => {
  test('returns valid regime enum and confidence in [0,1]', () => {
    const out = computeRegime({
      marketSentiment: 'bullish',
      spyVol20dZ: 0.6,
      spyRet1d: 0.01,
      shockEventFlag: false
    });

    expect(Object.values(REGIME_ENUM)).toContain(out.regime);
    expect(Object.values(VOLATILITY_REGIME_ENUM)).toContain(out.volatility_regime);
    expect(out.confidence).toBeGreaterThanOrEqual(0);
    expect(out.confidence).toBeLessThanOrEqual(1);
  });

  test('forces crisis volatility regime on severe daily drop', () => {
    const out = computeRegime({
      marketSentiment: 'neutral',
      spyVol20dZ: 0.8,
      spyRet1d: -0.035,
      shockEventFlag: false
    });

    expect(out.volatility_regime).toBe('crisis');
    expect(out.crisisActive).toBe(true);
  });
});
