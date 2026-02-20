const { createMvpDailyPipeline } = require('../src/services/mvpDailyPipeline');

describe('mvpDailyPipeline crisis mode strict inputs', () => {
  test('activates crisis for elevated volatility + shock event flag', async () => {
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('FROM news_items')) {
        return { rows: [{ tags: ['war'] }] };
      }
      return { rows: [] };
    });

    const svc = createMvpDailyPipeline({ query, logger: { log: jest.fn() }, narrativeService: { polishRecommendationItems: async ({ items }) => ({ items, meta: {} }), polishDigestBullets: async ({ bullets }) => ({ bullets, meta: {} }) } });
    const out = await svc.runCrisisModeCheck('2026-02-20', {
      volatilityRegime: 'elevated',
      indicators: { spyRet1d: -0.01, spyVol20d: 0.02, spyVol20dZ: 1.4 }
    });

    expect(out.isActive).toBe(true);
    expect(out.shockEventFlag).toBe(true);
    expect(out.triggers).toContain('high_impact_event_flag');
  });
});
