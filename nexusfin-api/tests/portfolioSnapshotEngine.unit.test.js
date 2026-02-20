const { calculateSnapshot } = require('../src/engines/portfolioSnapshotEngine');

describe('portfolioSnapshotEngine', () => {
  test('calculateSnapshot computes totals and pnl for known case', () => {
    const out = calculateSnapshot(
      [{ symbol: 'AAPL', qty: 10, avg_cost: 150, category: 'equity' }],
      { AAPL: { close: 263.04 } },
      { AAPL: { sector: 'Technology' } }
    );

    expect(out.total_value).toBeCloseTo(2630.4, 2);
    expect(out.total_cost).toBeCloseTo(1500, 2);
    expect(out.pnl_absolute).toBeCloseTo(1130.4, 2);
    expect(out.holdings_detail[0].sector).toBe('Technology');
  });

  test('skips holdings without price and keeps weight sum near 100', () => {
    const out = calculateSnapshot(
      [
        { symbol: 'AAPL', qty: 1, avg_cost: 100, category: 'equity' },
        { symbol: 'MSFT', qty: 1, avg_cost: 100, category: 'equity' },
        { symbol: 'NOPE', qty: 1, avg_cost: 10, category: 'equity' }
      ],
      { AAPL: { close: 150 }, MSFT: { close: 250 } },
      {}
    );

    expect(out.holdings_detail).toHaveLength(2);
    const weightSum = out.holdings_detail.reduce((sum, row) => sum + Number(row.weight_pct || 0), 0);
    expect(weightSum).toBeGreaterThanOrEqual(99.5);
    expect(weightSum).toBeLessThanOrEqual(100.5);
  });
});
