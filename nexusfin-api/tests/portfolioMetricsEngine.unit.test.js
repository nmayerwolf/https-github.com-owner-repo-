const {
  calculateAlignmentScore,
  calculateBenchmarkComparison,
  calculateExposure,
  calculateConcentration
} = require('../src/engines/portfolioMetricsEngine');

describe('portfolioMetricsEngine', () => {
  test('alignment score behaves by regime and is bounded', () => {
    const riskOnSnapshot = {
      holdings_detail: [{ symbol: 'AAPL', category: 'equity', weight_pct: 100, current_price: 200, sector: 'Technology' }]
    };
    const riskOffSnapshot = {
      holdings_detail: [{ symbol: 'BTCUSDT', category: 'crypto', weight_pct: 100, current_price: 40000, sector: 'Other' }]
    };
    const metricsMap = { AAPL: { sma_50: 150 }, BTCUSDT: { sma_50: 45000 } };

    const scoreRiskOn = calculateAlignmentScore(riskOnSnapshot, { regime: 'risk_on', leadership: ['Technology'] }, metricsMap);
    const scoreRiskOff = calculateAlignmentScore(riskOffSnapshot, { regime: 'risk_off', leadership: ['Utilities'] }, metricsMap);

    expect(scoreRiskOn).toBeGreaterThan(60);
    expect(scoreRiskOff).toBeLessThan(40);
    expect(scoreRiskOn).toBeGreaterThanOrEqual(0);
    expect(scoreRiskOn).toBeLessThanOrEqual(100);
  });

  test('benchmark comparison returns alpha and handles insufficient data', () => {
    const out = calculateBenchmarkComparison(
      [{ total_value: 105 }, { total_value: 100 }],
      [{ close: 103 }, { close: 100 }]
    );
    expect(out.portfolio_pnl_pct).toBeCloseTo(5, 4);
    expect(out.benchmark_pnl_pct).toBeCloseTo(3, 4);
    expect(out.alpha).toBeCloseTo(2, 4);

    const empty = calculateBenchmarkComparison([{ total_value: 100 }], [{ close: 100 }]);
    expect(empty).toEqual({ portfolio_pnl_pct: 0, benchmark_pnl_pct: 0, alpha: 0 });
  });

  test('exposure keys and concentration top3 are computed', () => {
    const holdings = [
      { category: 'equity', sector: 'Technology', weight_pct: 40 },
      { category: 'equity', sector: 'Healthcare', weight_pct: 30 },
      { category: 'equity', sector: 'Financials', weight_pct: 20 },
      { category: 'crypto', sector: 'Other', weight_pct: 10 }
    ];
    const exposure = calculateExposure(holdings);
    const top3 = calculateConcentration(holdings);

    expect(exposure.category_exposure.equity).toBeCloseTo(90, 4);
    expect(exposure.category_exposure.crypto).toBeCloseTo(10, 4);
    expect(top3).toBeCloseTo(90, 4);
  });
});
