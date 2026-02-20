const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const routes = require('../src/routes/reco');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.use('/api/reco', routes);
  app.use(errorHandler);
  return app;
};

describe('reco routes', () => {
  beforeEach(() => query.mockReset());

  it('returns task2 recommendation payload', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            items: [
              { ideaId: 's1', category: 'strategic', symbol: 'AAPL', confidence: 0.7, rationale: ['a'], risks: ['r'] },
              { ideaId: 'o1', category: 'opportunistic', symbol: 'TSLA', confidence: 0.6, rationale: ['a'], risks: ['r'] },
              { ideaId: 'r1', category: 'risk', title: 'Volatility spike', severity: 'high', bullets: ['a', 'b'], tags: ['risk'] }
            ]
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ regime: 'risk_on', volatility_regime: 'normal', leadership: [], macro_drivers: [], risk_flags: [], confidence: 0.8 }] })
      .mockResolvedValueOnce({ rows: [{ is_active: false, summary: 'ok', triggers: [], learn_more: {} }] });

    const res = await request(makeApp()).get('/api/reco/2026-02-20');

    expect(res.status).toBe(200);
    expect(res.body.regime).toBe('risk_on');
    expect(res.body.regime_label).toBe('Supportive');
    expect(res.body.strategic).toHaveLength(1);
    expect(res.body.opportunistic).toHaveLength(1);
    expect(res.body.risk_alerts).toHaveLength(1);
  });

  it('limits risks to 2 and only includes opportunisticType for opportunistic cards', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            items: [
              {
                ideaId: 's1',
                category: 'strategic',
                symbol: 'AAPL',
                confidence: 0.7,
                rationale: ['r1', 'r2', 'r3', 'r4'],
                risks: ['k1', 'k2', 'k3'],
                opportunisticType: 'overreaction'
              },
              {
                ideaId: 'o1',
                category: 'opportunistic',
                symbol: 'TSLA',
                confidence: 0.6,
                rationale: ['x'],
                risks: ['a', 'b', 'c'],
                opportunisticType: 'overreaction'
              }
            ]
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ regime: 'risk_on', volatility_regime: 'normal', leadership: [], macro_drivers: [], risk_flags: [], confidence: 0.8 }] })
      .mockResolvedValueOnce({ rows: [{ is_active: false, summary: 'ok', triggers: [], learn_more: {} }] });

    const res = await request(makeApp()).get('/api/reco/2026-02-20');

    expect(res.status).toBe(200);
    expect(res.body.strategic[0].risks).toHaveLength(2);
    expect(res.body.opportunistic[0].risks).toHaveLength(2);
    expect(res.body.strategic[0].opportunisticType).toBeUndefined();
    expect(res.body.opportunistic[0].opportunisticType).toBe('overreaction');
  });

  it('returns pending when no recommendations for date', async () => {
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM user_recommendations')) return { rows: [] };
      if (text.includes('FROM base_ideas')) return { rows: [] };
      if (text.includes('FROM regime_state')) return { rows: [{ regime: 'risk_on', volatility_regime: 'normal', leadership: [], macro_drivers: [], risk_flags: [], confidence: 0.8 }] };
      if (text.includes('FROM crisis_state')) return { rows: [{ is_active: false }] };
      return { rows: [] };
    });

    const res = await request(makeApp()).get('/api/reco/2026-02-20');
    expect(res.status).toBe(200);
    expect(res.body.pending).toBe(true);
  });
});
