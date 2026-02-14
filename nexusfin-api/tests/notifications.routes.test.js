const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const notificationsRoutes = require('../src/routes/notifications');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = (userId = 'u1') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId, email: 'user@mail.com' };
    next();
  });
  app.use('/api/notifications', notificationsRoutes);
  app.use(errorHandler);
  return app;
};

describe('notifications routes', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('returns vapid key payload', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/notifications/vapid-public-key');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('enabled');
    expect(res.body).toHaveProperty('publicKey');
  });

  it('returns default preferences when user has none', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).get('/api/notifications/preferences');

    expect(res.status).toBe(200);
    expect(res.body.stopLoss).toBe(true);
    expect(res.body.opportunities).toBe(true);
  });

  it('lists active subscriptions for authenticated user', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 's1', platform: 'ios', active: true, created_at: '2026-02-14T00:00:00.000Z' }]
    });

    const app = makeApp();
    const res = await request(app).get('/api/notifications/subscriptions');

    expect(res.status).toBe(200);
    expect(res.body.subscriptions).toHaveLength(1);
    expect(res.body.subscriptions[0].platform).toBe('ios');
  });

  it('creates web push subscription', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', platform: 'web', active: true }] });

    const app = makeApp();
    const res = await request(app).post('/api/notifications/subscribe').send({
      platform: 'web',
      subscription: { endpoint: 'https://example.com/sub', keys: { p256dh: 'k', auth: 'a' } }
    });

    expect(res.status).toBe(201);
    expect(res.body.platform).toBe('web');
  });

  it('creates mobile expo subscription', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 's2', platform: 'ios', active: true }] });

    const app = makeApp();
    const res = await request(app).post('/api/notifications/subscribe').send({
      platform: 'ios',
      expoPushToken: 'ExpoPushToken[token-123]'
    });

    expect(res.status).toBe(201);
    expect(res.body.platform).toBe('ios');
  });

  it('reactivates existing web subscription instead of creating duplicate', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-web' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-web', platform: 'web', active: true }] });

    const app = makeApp();
    const res = await request(app).post('/api/notifications/subscribe').send({
      platform: 'web',
      subscription: { endpoint: 'https://example.com/sub', keys: { p256dh: 'k', auth: 'a' } }
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('existing-web');
  });

  it('reactivates existing mobile subscription instead of creating duplicate', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-ios' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-ios', platform: 'ios', active: true }] });

    const app = makeApp();
    const res = await request(app).post('/api/notifications/subscribe').send({
      platform: 'ios',
      expoPushToken: 'ExpoPushToken[token-123]'
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('existing-ios');
  });

  it('handles concurrent subscribe race by recovering from unique violation', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce({ code: '23505' })
      .mockResolvedValueOnce({ rows: [{ id: 'raced-web' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'raced-web', platform: 'web', active: true }] });

    const app = makeApp();
    const res = await request(app).post('/api/notifications/subscribe').send({
      platform: 'web',
      subscription: { endpoint: 'https://example.com/sub', keys: { p256dh: 'k', auth: 'a' } }
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('raced-web');
  });

  it('rejects invalid quiet hours format', async () => {
    const app = makeApp();
    const res = await request(app).put('/api/notifications/preferences').send({ quietHoursStart: '25:99' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('sends test notification for authenticated user', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] })
    });

    query
      .mockResolvedValueOnce({ rows: [{ quiet_hours_start: null, quiet_hours_end: null }] })
      .mockResolvedValueOnce({
        rows: [{ id: 's-ios-1', platform: 'ios', subscription: { expoPushToken: 'ExpoPushToken[token-123]' } }]
      });

    const app = makeApp();
    const res = await request(app).post('/api/notifications/test').send({
      title: 'NexusFin test',
      body: 'Push de prueba',
      respectQuietHours: true
    });

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('validates test notification payload', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/notifications/test').send({ respectQuietHours: 'si' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 404 on unsubscribe missing subscription', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const app = makeApp();
    const res = await request(app).delete('/api/notifications/subscribe/missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('SUBSCRIPTION_NOT_FOUND');
  });
});
