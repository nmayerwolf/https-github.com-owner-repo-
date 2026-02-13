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

const { query } = require('../src/config/db');
const { generateUniqueGroupCode } = require('../src/services/groupCode');
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
});
