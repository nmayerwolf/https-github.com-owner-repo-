const { createMacroRadar } = require('../src/services/macroRadar');

describe('macroRadar service', () => {
  test('generates and persists fallback insight when AI is unavailable', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ risk_profile: 'moderado', horizon: 'mediano', sectors: ['tech'] }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 0, wins: 0, losses: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'm1', market_sentiment: 'neutral', sentiment_reasoning: 'x', themes: [], key_events: [], ai_model: null, created_at: '2026-02-16T10:00:00.000Z' }] });

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
    expect(query).toHaveBeenCalledTimes(6);
    expect(finnhub.generalNews).toHaveBeenCalled();
    expect(alpha.commodity).toHaveBeenCalled();
  });
});
