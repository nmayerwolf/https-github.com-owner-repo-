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

  it('evaluates mature signal outcomes and refreshes conviction policy', async () => {
    const query = jest.fn(async (sql) => {
      if (sql.includes('FROM regime_state')) {
        return { rows: [{ date: '2026-02-20', regime: 'transition', volatility_regime: 'normal', confidence: 0.7 }] };
      }
      if (sql.includes('FROM portfolios')) {
        return { rows: [] };
      }
      if (sql.includes('FROM horsai_signals s') && sql.includes('NOT EXISTS')) {
        return {
          rows: [
            {
              id: 's-out-1',
              user_id: 'u1',
              portfolio_id: 'p1',
              regime: 'risk_off',
              volatility_regime: 'elevated',
              confidence: 0.8,
              adjustment: { focus: 'risk_reduction' },
              shown_date: '2026-02-10'
            }
          ]
        };
      }
      if (sql.includes('FROM portfolio_snapshots')) {
        return {
          rows: [
            { date: '2026-02-10', total_value: 1000 },
            { date: '2026-02-11', total_value: 995 },
            { date: '2026-02-12', total_value: 980 },
            { date: '2026-02-20', total_value: 1020 }
          ]
        };
      }
      if (sql.includes('FROM user_agent_profile')) {
        return { rows: [{ risk_level: 0.6 }] };
      }
      if (sql.includes('INSERT INTO horsai_signal_outcomes')) {
        return { rows: [{ id: 'o1' }] };
      }
      if (sql.includes('SELECT COALESCE(AVG(rai), 0) AS rai_mean_20')) {
        return { rows: [{ rai_mean_20: 0.03 }] };
      }
      if (sql.includes('FROM horsai_user_conviction_policy')) {
        return { rows: [{ confidence_threshold: 0.75 }] };
      }
      if (sql.includes('INSERT INTO horsai_user_conviction_policy')) {
        return { rows: [{ user_id: 'u1', confidence_threshold: 0.75 }] };
      }
      return { rows: [] };
    });

    const service = createHorsaiDailyService({ query, logger: { warn: jest.fn() } });
    const out = await service.runGlobalDaily();

    expect(out.outcomesEvaluated).toBe(1);
    expect(out.convictionUpdated).toBe(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO horsai_signal_outcomes'), expect.any(Array));
  });
});
