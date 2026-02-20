const { selectCandidates } = require('../src/engines/ideasEngine');

describe('ideasEngine selectCandidates', () => {
  test('produces strategic candidates in risk_on with trend aligned metrics', async () => {
    const regime = { regime: 'risk_on' };
    const metrics = [{ symbol: 'AAPL', rsi_14: 55, relative_strength: 0.04, volatility_20d: 0.2, sma_50: 100, sma_200: 90 }];
    const bars = [{ symbol: 'AAPL', close: 120, change_pct: 1.2 }];

    const out = await selectCandidates(regime, metrics, bars);
    expect(out.strategic.length).toBeGreaterThan(0);
  });

  test('no opportunistic candidates when RSI stays between 40 and 60', async () => {
    const regime = { regime: 'risk_on' };
    const metrics = [{ symbol: 'MSFT', rsi_14: 50, relative_strength: 0.03, volatility_20d: 0.18, sma_50: 100, sma_200: 90 }];
    const bars = [{ symbol: 'MSFT', close: 110, change_pct: 0.5 }];

    const out = await selectCandidates(regime, metrics, bars);
    expect(out.opportunistic).toHaveLength(0);
  });

  test('produces risk candidates when volatility exceeds threshold', async () => {
    const regime = { regime: 'transition' };
    const metrics = [{ symbol: 'TSLA', rsi_14: 52, relative_strength: 0.01, volatility_20d: 0.4, sma_50: 100, sma_200: 90 }];
    const bars = [{ symbol: 'TSLA', close: 105, change_pct: -2 }];

    const out = await selectCandidates(regime, metrics, bars);
    expect(out.risk.length).toBeGreaterThan(0);
  });
});
