const { buildRegimeFromMetrics } = require('../src/services/mvpDailyPipeline');

describe('mvpDailyPipeline buildRegimeFromMetrics', () => {
  it('detects risk_on in constructive market with normal volatility', () => {
    const out = buildRegimeFromMetrics([
      { symbol: 'SPY', ret_1m: 0.04, ret_1d: 0.004, vol_20d: 0.018 },
      { symbol: 'QQQ', ret_1m: 0.06 },
      { symbol: 'IWM', ret_1m: 0.02 },
      { symbol: 'HYG', ret_1m: 0.02 },
      { symbol: 'IEF', ret_1m: 0.005 },
      { symbol: 'TLT', ret_1m: -0.01 }
    ]);

    expect(out.regime).toBe('risk_on');
    expect(out.volatilityRegime).toBe('normal');
    expect(out.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('detects crisis/risk_off when volatility and drawdown spike', () => {
    const out = buildRegimeFromMetrics([
      { symbol: 'SPY', ret_1m: -0.06, ret_1d: -0.04, vol_20d: 0.05 },
      { symbol: 'QQQ', ret_1m: -0.08 },
      { symbol: 'IWM', ret_1m: -0.03 },
      { symbol: 'HYG', ret_1m: -0.02 },
      { symbol: 'IEF', ret_1m: 0.01 },
      { symbol: 'TLT', ret_1m: 0.03 }
    ]);

    expect(out.regime).toBe('risk_off');
    expect(out.volatilityRegime).toBe('crisis');
    expect(Array.isArray(out.riskFlags)).toBe(true);
  });

  it('uses strict z-score thresholds for volatility regime when provided', () => {
    const elevated = buildRegimeFromMetrics(
      [
        { symbol: 'SPY', ret_1m: 0.01, ret_1d: -0.005, vol_20d: 0.02 },
        { symbol: 'QQQ', ret_1m: 0.02 },
        { symbol: 'IWM', ret_1m: 0.01 },
        { symbol: 'HYG', ret_1m: 0.01 },
        { symbol: 'IEF', ret_1m: 0.009 },
        { symbol: 'TLT', ret_1m: 0.0 }
      ],
      { spyVol20dZ: 1.2 }
    );

    const crisis = buildRegimeFromMetrics(
      [
        { symbol: 'SPY', ret_1m: 0.01, ret_1d: -0.005, vol_20d: 0.02 },
        { symbol: 'QQQ', ret_1m: 0.02 },
        { symbol: 'IWM', ret_1m: 0.01 },
        { symbol: 'HYG', ret_1m: 0.01 },
        { symbol: 'IEF', ret_1m: 0.009 },
        { symbol: 'TLT', ret_1m: 0.0 }
      ],
      { spyVol20dZ: 2.1 }
    );

    expect(elevated.volatilityRegime).toBe('elevated');
    expect(crisis.volatilityRegime).toBe('crisis');
  });
});
