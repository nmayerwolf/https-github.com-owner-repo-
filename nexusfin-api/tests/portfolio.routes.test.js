const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

const { query } = require('../src/config/db');
const portfolioRoutes = require('../src/routes/portfolio');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (userId = 'u1') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, email: 'user@mail.com' };
    next();
  });
  app.use('/api/portfolio', portfolioRoutes);
  app.use(errorHandler);
  return app;
};

describe('portfolio routes', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('rejects create when portfolio reached 15 active holdings', async () => {
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM portfolios p') && text.includes('WHERE p.id = $1')) {
        return { rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', is_owner: true, collaborator_role: null }] };
      }
      if (text.includes('COUNT(*)::int AS total FROM positions WHERE portfolio_id = $1')) {
        return { rows: [{ total: 15 }] };
      }
      return { rows: [] };
    });

    const app = makeApp();
    const res = await request(app).post('/api/portfolio').send({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      category: 'equity',
      buyDate: '2026-02-13',
      buyPrice: 100,
      quantity: 1,
      portfolioId: '11111111-1111-4111-8111-111111111111'
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('HOLDING_LIMIT_REACHED');
  });

  it('rejects patch for already sold position', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'p1', owner_user_id: 'u1', is_owner: true, collaborator_role: null, sell_date: '2026-02-10', sell_price: 120, buy_price: 100, quantity: 1, notes: null }]
    });

    const app = makeApp();
    const res = await request(app).patch('/api/portfolio/p1').send({ buyPrice: 101 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('POSITION_SOLD');
  });

  it('rejects sell when sellDate or sellPrice is missing', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'p1', owner_user_id: 'u1', is_owner: true, collaborator_role: null, sell_date: null, sell_price: null, buy_price: 100, quantity: 1, notes: null }]
    });

    const app = makeApp();
    const res = await request(app).patch('/api/portfolio/p1').send({ sellDate: '2026-02-13' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects create with invalid symbol format', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/portfolio').send({
      symbol: 'bad symbol!',
      name: 'Apple Inc.',
      category: 'equity',
      buyDate: '2026-02-13',
      buyPrice: 100,
      quantity: 1
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
  });

  it('sanitizes notes and uppercases symbol on create', async () => {
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM portfolios p') && text.includes('WHERE p.id = $1')) {
        return {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              name: 'Principal',
              is_default: true,
              owner_user_id: 'u1',
              is_owner: true,
              collaborator_role: null
            }
          ]
        };
      }
      if (text.includes('COUNT(*)::int AS total FROM positions WHERE portfolio_id = $1')) {
        return { rows: [{ total: 0 }] };
      }
      if (text.includes('INSERT INTO positions')) {
        return {
          rows: [
            {
              id: 'p1',
              portfolio_id: '11111111-1111-4111-8111-111111111111',
              symbol: 'AAPL',
              name: 'Apple Inc.',
              category: 'equity',
              buy_date: '2026-02-13',
              buy_price: '100',
              quantity: '1',
              sell_date: null,
              sell_price: null,
              notes: 'hola mundo',
              created_at: '2026-02-13T00:00:00.000Z'
            }
          ]
        };
      }
      return { rows: [] };
    });

    const app = makeApp();
    const res = await request(app).post('/api/portfolio').send({
      symbol: 'aapl',
      name: 'Apple Inc.',
      category: 'EQUITY',
      buyDate: '2026-02-13',
      buyPrice: 100,
      quantity: 1,
      portfolioId: '11111111-1111-4111-8111-111111111111',
      notes: 'hola\u0000 mundo'
    });

    expect(res.status).toBe(201);
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO positions'),
      ['u1', '11111111-1111-4111-8111-111111111111', 'AAPL', 'Apple Inc.', 'equity', '2026-02-13', 100, 1, 'hola mundo']
    );
  });

  it('rejects create when active holding with same symbol already exists in portfolio', async () => {
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM portfolios p') && text.includes('WHERE p.id = $1')) {
        return { rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', is_owner: true, collaborator_role: null }] };
      }
      if (text.includes('COUNT(*)::int AS total FROM positions WHERE portfolio_id = $1')) {
        return { rows: [{ total: 0 }] };
      }
      if (text.includes('FROM positions') && text.includes('symbol = $2') && text.includes('sell_date IS NULL')) {
        return { rows: [{ id: 'dup-1' }] };
      }
      return { rows: [] };
    });

    const app = makeApp();
    const res = await request(app).post('/api/portfolio').send({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      category: 'equity',
      buyDate: '2026-02-13',
      buyPrice: 100,
      quantity: 1,
      portfolioId: '11111111-1111-4111-8111-111111111111'
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_HOLDING');
  });

  it('maps unique violation to DUPLICATE_HOLDING on create race', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', owner_user_id: 'u1', is_owner: true, collaborator_role: null }] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce({ code: '23505' });

    const app = makeApp();
    const res = await request(app).post('/api/portfolio').send({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      category: 'equity',
      buyDate: '2026-02-13',
      buyPrice: 100,
      quantity: 1,
      portfolioId: '11111111-1111-4111-8111-111111111111'
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_HOLDING');
  });

  it('creates portfolio up to max 3', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({
        rows: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Growth', is_default: false, created_at: '2026-02-14T10:00:00.000Z' }]
      });

    const app = makeApp();
    const res = await request(app).post('/api/portfolio/portfolios').send({ name: 'Growth' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Growth');
  });

  it('rejects creating 4th portfolio', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 3 }] });

    const app = makeApp();
    const res = await request(app).post('/api/portfolio/portfolios').send({ name: 'Macro' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PORTFOLIO_LIMIT_REACHED');
  });

  it('forbids viewer collaborator from updating holding', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'p1', owner_user_id: 'u2', is_owner: false, collaborator_role: 'viewer', sell_date: null, sell_price: null, buy_price: 100, quantity: 1, notes: null }]
    });

    const app = makeApp('u1');
    const res = await request(app).patch('/api/portfolio/p1').send({ buyPrice: 101 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_PORTFOLIO_ACTION');
  });

  it('allows editor collaborator to update holding', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 'p1', owner_user_id: 'u2', is_owner: false, collaborator_role: 'editor', sell_date: null, sell_price: null, buy_price: 100, quantity: 1, notes: null }]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'p1',
            portfolio_id: '11111111-1111-4111-8111-111111111111',
            symbol: 'AAPL',
            name: 'Apple Inc.',
            category: 'equity',
            buy_date: '2026-02-13',
            buy_price: 101,
            quantity: 1,
            sell_date: null,
            sell_price: null,
            notes: null,
            created_at: '2026-02-13T00:00:00.000Z'
          }
        ]
      });

    const app = makeApp('u1');
    const res = await request(app).patch('/api/portfolio/p1').send({ buyPrice: 101 });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('p1');
  });

  it('returns FEATURE_REMOVED for sharing endpoints', async () => {
    const app = makeApp('u1');
    const inviteRes = await request(app)
      .post('/api/portfolio/portfolios/11111111-1111-4111-8111-111111111111/invite')
      .send({ email: 'other@mail.com' });
    expect(inviteRes.status).toBe(410);
    expect(inviteRes.body.error.code).toBe('FEATURE_REMOVED');

    const receivedRes = await request(app).get('/api/portfolio/invitations/received');
    expect(receivedRes.status).toBe(410);
    expect(receivedRes.body.error.code).toBe('FEATURE_REMOVED');

    const respondRes = await request(app)
      .post('/api/portfolio/invitations/inv-1/respond')
      .send({ action: 'accept' });
    expect(respondRes.status).toBe(410);
    expect(respondRes.body.error.code).toBe('FEATURE_REMOVED');
  });
});
