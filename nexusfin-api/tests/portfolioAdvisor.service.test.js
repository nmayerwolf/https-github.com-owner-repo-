const { createPortfolioAdvisor, summarizePortfolio } = require('../src/services/portfolioAdvisor');

describe('portfolioAdvisor service', () => {
  test('summarizePortfolio aggregates allocations', () => {
    const summary = summarizePortfolio([
      { symbol: 'AAPL', category: 'equity', quantity: 2, buy_price: 100 },
      { symbol: 'BTCUSDT', category: 'crypto', quantity: 1, buy_price: 200 }
    ]);

    expect(summary.positionsCount).toBe(2);
    expect(summary.totalValue).toBe(400);
    expect(summary.allocationByClass.equity).toBe(50);
    expect(summary.allocationByClass.crypto).toBe(50);
  });

  test('generateForUser skips when positions are below minimum', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ symbol: 'AAPL', category: 'equity', quantity: 1, buy_price: 100 }] })
      .mockResolvedValueOnce({ rows: [{ risk_profile: 'moderado', horizon: 'mediano', sectors: ['tech'] }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 0, wins: 0, losses: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const service = createPortfolioAdvisor({ query, aiAgent: { configured: false } });
    const out = await service.generateForUser('u1');

    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('MIN_PORTFOLIO_REQUIRED');
  });
});
