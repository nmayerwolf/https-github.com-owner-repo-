const { computeAlignmentScore } = require('../src/services/portfolioSnapshots');

describe('portfolioSnapshots computeAlignmentScore', () => {
  it('gives higher score when holdings align with leadership in risk_on', () => {
    const score = computeAlignmentScore({
      totalValue: 100,
      leadership: ['mega_cap_tech'],
      regime: 'risk_on',
      volatilityRegime: 'normal',
      holdings: [
        { symbol: 'AAPL', sector: 'mega_cap_tech', tags: ['mega_cap_tech'], category: 'equity', mark_value: 60 },
        { symbol: 'MSFT', sector: 'technology', tags: ['mega_cap_tech'], category: 'equity', mark_value: 40 }
      ]
    });

    expect(score).toBeGreaterThanOrEqual(60);
  });

  it('penalizes concentrated equity book in risk_off crisis', () => {
    const score = computeAlignmentScore({
      totalValue: 100,
      leadership: ['defensives'],
      regime: 'risk_off',
      volatilityRegime: 'crisis',
      holdings: [
        { symbol: 'TSLA', sector: 'consumer_discretionary', tags: ['growth'], category: 'equity', mark_value: 80 },
        { symbol: 'NVDA', sector: 'technology', tags: ['ai'], category: 'equity', mark_value: 20 }
      ]
    });

    expect(score).toBeLessThanOrEqual(45);
  });
});
