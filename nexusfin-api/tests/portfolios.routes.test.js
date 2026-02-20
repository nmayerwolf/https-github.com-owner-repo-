const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const routes = require('../src/routes/portfolios');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.use('/api/portfolios', routes);
  app.use(errorHandler);
  return app;
};

describe('portfolios v2 routes', () => {
  beforeEach(() => query.mockReset());

  it('creates portfolio honoring limit', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Core', currency: 'USD', created_at: '2026-02-20T00:00:00.000Z' }] });

    const res = await request(makeApp()).post('/api/portfolios').send({ name: 'Core', currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('owner');
    expect(res.body.name).toBe('Core');
  });

  it('rejects holdings replacement above max', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', role: 'owner', name: 'Core', currency: 'USD' }] });

    const holdings = Array.from({ length: 16 }, (_, i) => ({ symbol: `S${i}`, qty: 1, avg_cost: 10 }));
    const res = await request(makeApp())
      .put('/api/portfolios/11111111-1111-4111-8111-111111111111/holdings')
      .send({ holdings });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('HOLDING_LIMIT_REACHED');
    expect(res.body.error.details).toEqual({ limit: 15, attempted: 16 });
  });

  it('rejects duplicate holdings symbols with conflict', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', role: 'owner', name: 'Core', currency: 'USD' }] });

    const res = await request(makeApp())
      .put('/api/portfolios/11111111-1111-4111-8111-111111111111/holdings')
      .send({
        holdings: [
          { symbol: 'AAPL', qty: 1, avg_cost: 100 },
          { symbol: 'aapl', qty: 2, avg_cost: 110 }
        ]
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_HOLDING');
    expect(res.body.error.details).toEqual({ symbol: 'AAPL' });
  });

  it('returns INVITE_ALREADY_ACCEPTED when accepting an already accepted invitation', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111112',
          portfolio_id: '11111111-1111-4111-8111-111111111111',
          invited_user_id: 'u1',
          invited_email: 'user@mail.com',
          role: 'editor',
          status: 'accepted'
        }
      ]
    });

    const res = await request(makeApp())
      .post('/api/portfolios/11111111-1111-4111-8111-111111111111/accept')
      .send({ inviteId: '11111111-1111-4111-8111-111111111112' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVITE_ALREADY_ACCEPTED');
  });

  it('returns INVITE_NOT_FOUND when invite does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .post('/api/portfolios/11111111-1111-4111-8111-111111111111/accept')
      .send({ invite_id: '11111111-1111-4111-8111-111111111112' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVITE_NOT_FOUND');
  });

  it('returns portfolio contract with holdings + snapshot + alignment + exposures + ai notes', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', role: 'owner', name: 'Core', currency: 'USD' }]
      })
      .mockResolvedValueOnce({
        rows: [{ symbol: 'AAPL', qty: '2', avg_cost: '100', category: 'equity', name: 'Apple', source: 'manual' }]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            snapshot_date: '2026-02-20',
            total_value: '2500.50',
            pnl_day: '50.25',
            pnl_total: '300.75',
            benchmark_ret: '0.0125',
            alignment_score: '78',
            sector_exposure: { technology: 80, healthcare: 20 },
            concentration: { topHoldings: [{ symbol: 'AAPL', weight: 80 }], herfindahl: 0.52 },
            ai_notes: 'Portfolio bien alineado al régimen risk_on.'
          }
        ]
      });

    const res = await request(makeApp()).get('/api/portfolios/11111111-1111-4111-8111-111111111111');

    expect(res.status).toBe(200);
    expect(res.body.holdings).toHaveLength(1);
    expect(res.body.latestSnapshot.date).toBe('2026-02-20');
    expect(res.body.latestSnapshot.totalValue).toBeCloseTo(2500.5, 5);
    expect(res.body.benchmarkCompare.symbol).toBe('SPY');
    expect(res.body.alignmentScore).toBe(78);
    expect(res.body.exposures.technology).toBe(80);
    expect(res.body.aiNotes).toContain('alineado');
  });

  it('returns null snapshot fields when no daily snapshot exists yet', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', role: 'owner', name: 'Core', currency: 'USD' }]
      })
      .mockResolvedValueOnce({
        rows: [{ symbol: 'MSFT', qty: '1', avg_cost: '250', category: 'equity', name: 'Microsoft', source: 'reco' }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp()).get('/api/portfolios/11111111-1111-4111-8111-111111111111');

    expect(res.status).toBe(200);
    expect(res.body.latestSnapshot).toBeNull();
    expect(res.body.benchmarkCompare).toBeNull();
    expect(res.body.alignmentScore).toBeNull();
    expect(res.body.exposures).toEqual({});
    expect(res.body.aiNotes).toBeNull();
  });

  it('GET /metrics returns latest metrics payload', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', role: 'owner', name: 'Core', currency: 'USD' }]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            metric_date: '2026-02-20',
            alignment_score: 72,
            benchmark_symbol: 'SPY',
            benchmark_pnl_pct: 1.25,
            portfolio_pnl_pct: 2.1,
            alpha: 0.85,
            sector_exposure: { Technology: 45.2 },
            category_exposure: { equity: 62.5 },
            concentration_top3_pct: 67.3,
            ai_notes: ['note 1', 'note 2']
          }
        ]
      });

    const res = await request(makeApp()).get('/api/portfolios/11111111-1111-4111-8111-111111111111/metrics');
    expect(res.status).toBe(200);
    expect(res.body.alignment_score).toBe(72);
    expect(res.body.benchmark.symbol).toBe('SPY');
    expect(res.body.exposure.by_category.equity).toBe(62.5);
    expect(res.body.ai_notes).toHaveLength(2);
  });

  it('GET /snapshots returns latest N snapshots', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', role: 'owner', name: 'Core', currency: 'USD' }]
      })
      .mockResolvedValueOnce({
        rows: [
          { snapshot_date: '2026-02-20', total_value: '12500', pnl_pct: '8.5' },
          { snapshot_date: '2026-02-19', total_value: '12380', pnl_pct: '7.4' }
        ]
      });

    const res = await request(makeApp()).get('/api/portfolios/11111111-1111-4111-8111-111111111111/snapshots?days=2');
    expect(res.status).toBe(200);
    expect(res.body.snapshots).toHaveLength(2);
    expect(res.body.snapshots[0].date).toBe('2026-02-20');
  });

  it('GET /holdings/detail returns latest snapshot holdings detail', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', role: 'owner', name: 'Core', currency: 'USD' }]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            snapshot_date: '2026-02-20',
            total_value: '12500',
            holdings_detail: [{ symbol: 'AAPL', qty: 10, current_price: 263.04, weight_pct: 32.5 }]
          }
        ]
      });

    const res = await request(makeApp()).get('/api/portfolios/11111111-1111-4111-8111-111111111111/holdings/detail');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-02-20');
    expect(res.body.holdings).toHaveLength(1);
    expect(res.body.holdings[0].symbol).toBe('AAPL');
  });
});
