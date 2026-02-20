const { detectRegime } = require('../src/engines/regimeEngine');

describe('regimeEngine', () => {
  test('risk_on when SPY above both SMAs and breadth > 0.6', () => {
    const out = detectRegime({
      spy: { close: 500, sma_50: 480, sma_200: 450, rsi_14: 60, volatility_20d: 0.12 },
      vix: 16,
      breadth: 0.7,
      sectorPerf: [{ category: 'tech', perf20d: 0.1 }]
    });
    expect(out.regime).toBe('risk_on');
  });

  test('risk_off when SPY below both SMAs and breadth < 0.4', () => {
    const out = detectRegime({
      spy: { close: 400, sma_50: 420, sma_200: 450, rsi_14: 40, volatility_20d: 0.2 },
      vix: 22,
      breadth: 0.3,
      sectorPerf: [{ category: 'utilities', perf20d: 0.02 }]
    });
    expect(out.regime).toBe('risk_off');
  });

  test('confidence is always between 0 and 1', () => {
    const out = detectRegime({
      spy: { close: 500, sma_50: 490, sma_200: 480, rsi_14: 55, volatility_20d: 0.1 },
      vix: 10,
      breadth: 5
    });
    expect(out.confidence).toBeGreaterThanOrEqual(0);
    expect(out.confidence).toBeLessThanOrEqual(1);
  });

  test('volatility regime is crisis when VIX > 30', () => {
    const out = detectRegime({
      spy: { close: 500, sma_50: 480, sma_200: 470, rsi_14: 55, volatility_20d: 0.1 },
      vix: 35,
      breadth: 0.55
    });
    expect(out.volatility_regime).toBe('crisis');
  });
});
