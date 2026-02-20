const { sma, rsi, volatility20d } = require('../src/engines/metricsEngine');

describe('metricsEngine', () => {
  test('sma([1,2,3,4,5],3) is 4', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
  });

  test('rsi returns bounded value', () => {
    const value = rsi([100, 102, 101, 103, 104, 106, 105, 107, 109, 108, 110, 111, 112, 113, 114]);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  test('volatility20d on flat series is near 0', () => {
    const value = volatility20d(new Array(25).fill(100));
    expect(value).toBeCloseTo(0, 8);
  });
});
