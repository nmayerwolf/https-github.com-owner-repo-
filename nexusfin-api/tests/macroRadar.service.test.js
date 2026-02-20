const { createMacroRadar } = require('../src/services/macroRadar');

describe('macroRadar service', () => {
  test('generates and persists fallback insight when AI is unavailable', async () => {
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('FROM user_configs')) return { rows: [{ risk_profile: 'moderado', horizon: 'mediano', sectors: ['tech'] }] };
      if (String(sql).includes('FROM positions')) return { rows: [] };
      if (String(sql).includes('FROM alerts') && String(sql).includes('COUNT(*)::int AS count')) return { rows: [{ count: 0, wins: 0, losses: 0 }] };
      if (String(sql).includes('FROM alerts') && String(sql).includes('ORDER BY created_at DESC')) return { rows: [] };
      if (String(sql).includes('SELECT MAX(date)::text AS date FROM market_daily_bars')) return { rows: [{ date: '2026-02-19' }] };
      if (String(sql).includes('FROM market_daily_bars b') && String(sql).includes('b.symbol = ANY')) return { rows: [] };
      if (String(sql).includes('FROM market_daily_bars b') && String(sql).includes('ORDER BY ABS')) return { rows: [] };
      if (String(sql).includes('pct_above_ma50')) return { rows: [{ pct_above_ma50: 50 }] };
      if (String(sql).includes('FROM regime_state')) return { rows: [{ regime: 'transition', volatility_regime: 'normal', leadership: [], risk_flags: [], confidence: 0.55 }] };
      if (String(sql).includes('FROM news_items')) return { rows: [] };
      if (String(sql).includes('INSERT INTO macro_insights')) {
        return { rows: [{ id: 'm1', market_sentiment: 'neutral', sentiment_reasoning: 'x', themes: [], key_events: [], ai_model: null, created_at: '2026-02-16T10:00:00.000Z' }] };
      }
      return { rows: [] };
    });

    const finnhub = {
      quote: jest.fn(async () => ({ c: 100, dp: 1.2 })),
      generalNews: jest.fn(async () => [{ headline: 'Fed event', datetime: Math.floor(Date.now() / 1000) }])
    };
    const alpha = {
      commodity: jest.fn(async () => ({ data: [{ value: '2000' }] }))
    };

    const service = createMacroRadar({ query, finnhub, alpha, aiAgent: { configured: false } });
    const out = await service.generateForUser('u1');

    expect(out).toHaveProperty('id', 'm1');
    expect(query).toHaveBeenCalled();
    expect(finnhub.generalNews).toHaveBeenCalled();
    expect(alpha.commodity).toHaveBeenCalled();
  });
});
