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

  test('generateForUser yields at least one recommendation when data exists', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { symbol: 'AAPL', category: 'equity', quantity: 2, buy_price: 100, buy_date: '2026-02-10' },
          { symbol: 'MSFT', category: 'equity', quantity: 1, buy_price: 150, buy_date: '2026-02-11' }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ risk_profile: 'moderado', horizon: 'mediano', sectors: ['tech'] }] })
      .mockResolvedValueOnce({ rows: [{ market_sentiment: 'neutral', themes: [], key_events: [] }] })
      .mockResolvedValueOnce({ rows: [{ count: 3, wins: 2, losses: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'adv-1',
            user_id: 'u1',
            health_score: 7,
            health_summary: 'ok',
            concentration_risk: 'medium',
            allocation_analysis: {},
            recommendations: [{ type: 'hold', priority: 'low', asset: 'portfolio', detail: 'Mantener', amount_pct: 0, strategyType: 'strategic' }],
            ai_model: null,
            created_at: '2026-02-19T00:00:00.000Z'
          }
        ]
      });

    const service = createPortfolioAdvisor({ query, aiAgent: { configured: false } });
    const out = await service.generateForUser('u1');

    expect(out.skipped).toBeFalsy();
    expect(Array.isArray(out.recommendations)).toBe(true);
    expect(out.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(out.recommendations.some((item) => item.strategyType === 'strategic')).toBe(true);
  });
});
