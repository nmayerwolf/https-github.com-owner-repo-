const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

jest.mock('../src/services/groupCode', () => ({
  generateUniqueGroupCode: jest.fn()
}));

jest.mock('../src/services/finnhub', () => ({
  quote: jest.fn()
}));

const { query } = require('../src/config/db');
const { generateUniqueGroupCode } = require('../src/services/groupCode');
const { quote } = require('../src/services/finnhub');
const groupsRoutes = require('../src/routes/groups');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (userId = 'u-admin') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, email: 'user@mail.com' };
    next();
  });
  app.use('/api/groups', groupsRoutes);
  app.use(errorHandler);
  return app;
};

describe('groups routes', () => {
  beforeEach(() => {
    query.mockReset();
    generateUniqueGroupCode.mockReset();
    quote.mockReset();
  });

  it('rejects create group when user already has 5 groups', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: 5 }] });

    const app = makeApp('u-admin');
    const res = await request(app).post('/api/groups').send({ name: 'Grupo 6' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GROUP_LIMIT_REACHED');
  });

  it('rejects join when target group is full', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Mi Grupo', code: 'NXF-A7K2M' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 20 }] });

    const app = makeApp('u-admin');
    const res = await request(app).post('/api/groups/join').send({ code: 'NXF-A7K2M' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GROUP_MEMBER_LIMIT_REACHED');
  });

  it('allows admin to rename group', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Nuevo Nombre', code: 'NXF-A7K2M' }] })
      .mockResolvedValueOnce({ rows: [{ total: 3 }] });

    const app = makeApp('u-admin');
    const res = await request(app).patch('/api/groups/g1').send({ name: 'Nuevo Nombre' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Nuevo Nombre');
    expect(res.body.role).toBe('admin');
    expect(res.body.members).toBe(3);
    expect(query).toHaveBeenNthCalledWith(
      2,
      'UPDATE groups SET name = $1 WHERE id = $2 RETURNING id, name, code',
      ['Nuevo Nombre', 'g1']
    );
  });

  it('rejects rename when requester is not admin', async () => {
    query.mockResolvedValueOnce({ rows: [{ role: 'member' }] });

    const app = makeApp('u-member');
    const res = await request(app).patch('/api/groups/g1').send({ name: 'Nuevo Nombre' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ADMIN_ONLY');
  });

  it('rejects rename when name is empty', async () => {
    query.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });

    const app = makeApp('u-admin');
    const res = await request(app).patch('/api/groups/g1').send({ name: '   ' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('allows admin to delete group', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp('u-admin');
    const res = await request(app).delete('/api/groups/g1');

    expect(res.status).toBe(204);
    expect(query).toHaveBeenNthCalledWith(2, 'DELETE FROM groups WHERE id = $1', ['g1']);
  });

  it('rejects delete group when requester is not admin', async () => {
    query.mockResolvedValueOnce({ rows: [{ role: 'member' }] });

    const app = makeApp('u-member');
    const res = await request(app).delete('/api/groups/g1');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ADMIN_ONLY');
  });

  it('prevents admin from removing another admin', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'u-other', role: 'admin' }] });

    const app = makeApp('u-admin');
    const res = await request(app).delete('/api/groups/g1/members/u-other');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CANNOT_REMOVE_ADMIN');
  });

  it('prevents remove-member endpoint for self user', async () => {
    query.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });

    const app = makeApp('u-admin');
    const res = await request(app).delete('/api/groups/g1/members/u-admin');

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('USE_LEAVE_FOR_SELF');
  });

  it('returns 404 when target member is missing', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = makeApp('u-admin');
    const res = await request(app).delete('/api/groups/g1/members/u-missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('GROUP_MEMBER_NOT_FOUND');
  });

  it('returns group detail with privacy-safe member positions and computed plPercent', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Mi Grupo', code: 'NXF-A7K2M' }] })
      .mockResolvedValueOnce({
        rows: [
          { user_id: 'u-admin', role: 'admin', joined_at: '2026-02-13T10:00:00Z', display_name: 'owner' },
          { user_id: 'u-member', role: 'member', joined_at: '2026-02-13T10:01:00Z', display_name: 'amigo' }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ symbol: 'AAPL', category: 'equity', quantity: '10', buy_price: '100' }] })
      .mockResolvedValueOnce({ rows: [{ symbol: 'AAPL', category: 'equity', quantity: '2', buy_price: '120' }] });

    quote.mockResolvedValue({ c: 110 });

    const app = makeApp('u-admin');
    const res = await request(app).get('/api/groups/g1');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('g1');
    expect(res.body.role).toBe('admin');
    expect(res.body.memberCount).toBe(2);
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members[0]).toEqual({
      userId: 'u-admin',
      displayName: 'owner',
      role: 'admin',
      positions: [{ symbol: 'AAPL', category: 'equity', quantity: 10, plPercent: 10 }]
    });
    expect(res.body.members[0].positions[0].buyPrice).toBeUndefined();
    expect(res.body.members[1].positions[0].plPercent).toBeCloseTo(-8.3333, 4);
    expect(quote).toHaveBeenCalledTimes(1);
    expect(quote).toHaveBeenCalledWith('AAPL');
  });

  it('keeps plPercent as null when quote lookup fails', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Mi Grupo', code: 'NXF-A7K2M' }] })
      .mockResolvedValueOnce({
        rows: [{ user_id: 'u-admin', role: 'admin', joined_at: '2026-02-13T10:00:00Z', display_name: 'owner' }]
      })
      .mockResolvedValueOnce({ rows: [{ symbol: 'TSLA', category: 'equity', quantity: '1', buy_price: '200' }] });

    quote.mockRejectedValueOnce(new Error('rate limited'));

    const app = makeApp('u-admin');
    const res = await request(app).get('/api/groups/g1');

    expect(res.status).toBe(200);
    expect(res.body.members[0].positions[0].plPercent).toBeNull();
  });

  it('returns 404 on group detail when requester is not member', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const app = makeApp('u-outsider');
    const res = await request(app).get('/api/groups/g1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('GROUP_NOT_FOUND');
  });
});
