jest.mock('../src/services/jobRunTracker', () => ({
  withTrackedJobRun: jest.fn(async ({ run }) => run('2026-02-20'))
}));

const { createHorsaiDailyService } = require('../src/services/horsaiDaily');

describe('horsaiDaily service', () => {
  it('generates a signal when both scores are low and confidence passes threshold', async () => {
    const query = jest.fn(async (sql) => {
      if (sql.includes('FROM regime_state')) {
        return { rows: [{ date: '2026-02-20', regime: 'risk_off', volatility_regime: 'elevated', confidence: 0.8 }] };
      }
      if (sql.includes('FROM portfolios')) {
        return { rows: [{ portfolio_id: 'p1', user_id: 'u1' }] };
      }
      if (sql.includes('FROM portfolio_metrics')) {
        return { rows: [{ alignment_score: 20 }] };
      }
      if (sql.includes('AVG(score_total) AS avg_score')) {
        return { rows: [{ avg_score: 90 }] };
      }
      if (sql.includes('FROM horsai_signals') && sql.includes('ORDER BY shown_at DESC')) {
        return { rows: [] };
      }
      if (sql.includes('FROM horsai_user_conviction_policy')) {
        return { rows: [{ confidence_threshold: 0.75 }] };
      }
      if (sql.includes('INSERT INTO horsai_portfolio_scores_daily')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO horsai_signals')) {
        return { rows: [{ id: 's1' }] };
      }
      return { rows: [] };
    });

    const service = createHorsaiDailyService({ query, logger: { warn: jest.fn() } });
    const out = await service.runGlobalDaily();

    expect(out.portfoliosScanned).toBe(1);
    expect(out.scored).toBe(1);
    expect(out.generated).toBe(1);
    expect(out.skippedByCooldown).toBe(0);
  });

  it('skips signal generation during active cooldown', async () => {
    const query = jest.fn(async (sql) => {
      if (sql.includes('FROM regime_state')) {
        return { rows: [{ date: '2026-02-20', regime: 'risk_off', volatility_regime: 'normal', confidence: 0.82 }] };
      }
      if (sql.includes('FROM portfolios')) {
        return { rows: [{ portfolio_id: 'p1', user_id: 'u1' }] };
      }
      if (sql.includes('FROM portfolio_metrics')) {
        return { rows: [{ alignment_score: 20 }] };
      }
      if (sql.includes('AVG(score_total) AS avg_score')) {
        return { rows: [{ avg_score: 90 }] };
      }
      if (sql.includes('FROM horsai_signals') && sql.includes('ORDER BY shown_at DESC')) {
        return {
          rows: [
            {
              id: 's-prev',
              score: 18,
              regime: 'risk_off',
              volatility_regime: 'normal',
              user_action: 'dismissed',
              dismiss_streak: 1,
              consecutive_display_days: 2,
              cooldown_until: '2026-02-28',
              shown_at: '2026-02-19T10:00:00.000Z'
            }
          ]
        };
      }
      if (sql.includes('FROM horsai_user_conviction_policy')) {
        return { rows: [{ confidence_threshold: 0.75 }] };
      }
      if (sql.includes('INSERT INTO horsai_portfolio_scores_daily')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO horsai_signals')) {
        throw new Error('Should not insert signal when cooldown is active');
      }
      return { rows: [] };
    });

    const service = createHorsaiDailyService({ query, logger: { warn: jest.fn() } });
    const out = await service.runGlobalDaily();

    expect(out.portfoliosScanned).toBe(1);
    expect(out.scored).toBe(1);
    expect(out.generated).toBe(0);
    expect(out.skippedByCooldown).toBe(1);
  });
});
