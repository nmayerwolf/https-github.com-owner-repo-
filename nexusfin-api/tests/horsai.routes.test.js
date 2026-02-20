const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const routes = require('../src/routes/horsai');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.use('/api/horsai', routes);
  app.use(errorHandler);
  return app;
};

describe('horsai routes', () => {
  beforeEach(() => query.mockReset());

  it('returns portfolio summary with market labels and scores', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', role: 'owner' }] })
      .mockResolvedValueOnce({ rows: [{ date: '2026-02-20', regime: 'risk_on', volatility_regime: 'normal', confidence: 0.82 }] })
      .mockResolvedValueOnce({ rows: [{ alignment_score: 71 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            score: 33,
            suggestion_level: 2,
            confidence: 0.81,
            diagnosis: 'Baja diversificación defensiva.',
            risk_impact: 'Mayor sensibilidad a shocks macro.',
            adjustment: { move: 'rebalance' },
            specific_assets: [{ symbol: 'XLP' }],
            user_action: 'pending',
            cooldown_until: null,
            shown_at: '2026-02-20T10:00:00.000Z'
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp()).get('/api/horsai/portfolio/11111111-1111-4111-8111-111111111111/summary');

    expect(res.status).toBe(200);
    expect(res.body.marketEnvironment.labels.market).toBe('Supportive');
    expect(res.body.marketEnvironment.labels.volatility).toBe('Calm');
    expect(res.body.scores.marketAlignment).toBe(71);
    expect(res.body.suggestion.level).toBe(2);
  });

  it('applies signal action and returns cooldown', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: '22222222-2222-4222-8222-222222222222', user_action: 'pending', dismiss_streak: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            user_id: 'u1',
            portfolio_id: '11111111-1111-4111-8111-111111111111',
            user_action: 'dismissed',
            dismiss_streak: 2,
            cooldown_until: '2026-03-06',
            updated_at: '2026-02-20T12:00:00.000Z'
          }
        ]
      });

    const res = await request(makeApp())
      .post('/api/horsai/signals/22222222-2222-4222-8222-222222222222/action')
      .send({ action: 'dismiss' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('dismissed');
    expect(res.body.dismissStreak).toBe(2);
    expect(res.body.cooldownUntil).toBe('2026-03-06');
  });

  it('returns 404 when signal action target does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .post('/api/horsai/signals/22222222-2222-4222-8222-222222222222/action')
      .send({ action: 'acknowledge' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SIGNAL_NOT_FOUND');
  });

  it('returns signal review aggregates', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', role: 'viewer' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            total_signals: 12,
            risk_reduction_cases: 8,
            avg_delta_volatility: 0.034,
            perf_improvement_cases: 7,
            avg_rai: 0.021,
            adverse_cases: 3,
            neutral_cases: 2,
            favorable_cases: 7
          }
        ]
      });

    const res = await request(makeApp()).get('/api/horsai/portfolio/11111111-1111-4111-8111-111111111111/signal-review?days=90');

    expect(res.status).toBe(200);
    expect(res.body.metrics.signalsAffectingPortfolio).toBe(12);
    expect(res.body.metrics.avgVolatilityReductionPct).toBeCloseTo(3.4, 3);
    expect(res.body.outcomes.adverse).toBe(3);
  });
});
