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
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('FROM positions')) {
        return {
          rows: [
            { symbol: 'AAPL', category: 'equity', quantity: 2, buy_price: 100, buy_date: '2026-02-10' },
            { symbol: 'MSFT', category: 'equity', quantity: 1, buy_price: 150, buy_date: '2026-02-11' }
          ]
        };
      }
      if (String(sql).includes('FROM user_configs')) return { rows: [{ risk_profile: 'moderado', horizon: 'mediano', sectors: ['tech'] }] };
      if (String(sql).includes('FROM macro_insights')) return { rows: [{ market_sentiment: 'neutral', themes: [], key_events: [] }] };
      if (String(sql).includes('COUNT(*)::int AS count')) return { rows: [{ count: 3, wins: 2, losses: 1 }] };
      if (String(sql).includes('ORDER BY created_at DESC')) return { rows: [] };
      if (String(sql).includes('SELECT MAX(date)::text AS date FROM market_daily_bars')) return { rows: [{ date: '2026-02-20' }] };
      if (String(sql).includes('SELECT regime, volatility_regime, leadership FROM regime_state')) {
        return { rows: [{ regime: 'risk_on', volatility_regime: 'normal', leadership: ['mega_cap_tech'] }] };
      }
      if (String(sql).includes('FROM market_daily_bars') && String(sql).includes('symbol = ANY')) {
        return { rows: [{ symbol: 'AAPL', close: 110 }, { symbol: 'MSFT', close: 165 }] };
      }
      if (String(sql).includes('FROM market_daily_bars') && String(sql).includes('ORDER BY symbol ASC')) {
        const baseRows = [];
        for (let i = 0; i < 60; i += 1) {
          baseRows.push({ symbol: 'AAPL', date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, high: 111, low: 109, close: 110, volume: 1000 });
          baseRows.push({ symbol: 'MSFT', date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, high: 166, low: 164, close: 165, volume: 1200 });
        }
        return { rows: baseRows };
      }
      if (String(sql).includes('FROM market_metrics_daily')) return { rows: [{ symbol: 'AAPL', vol_20d: 0.2 }, { symbol: 'MSFT', vol_20d: 0.18 }] };
      if (String(sql).includes('INSERT INTO portfolio_advice')) {
        return {
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
        };
      }
      return { rows: [] };
    });

    const service = createPortfolioAdvisor({ query, aiAgent: { configured: false } });
    const out = await service.generateForUser('u1');

    expect(out.skipped).toBeFalsy();
    expect(Array.isArray(out.recommendations)).toBe(true);
    expect(out.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(out.recommendations.some((item) => item.strategyType === 'strategic')).toBe(true);
  });
});
