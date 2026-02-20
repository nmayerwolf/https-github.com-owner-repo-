const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const routes = require('../src/routes/crisis');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.use('/api/crisis', routes);
  app.use(errorHandler);
  return app;
};

describe('crisis routes', () => {
  beforeEach(() => query.mockReset());

  it('returns persisted crisis state', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          is_active: true,
          title: 'Elevated Market Volatility',
          summary: 'stress',
          triggers: ['volatility spike'],
          what_changed: ['risk-first']
        }
      ]
    });

    const res = await request(makeApp()).get('/api/crisis/today');

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);
    expect(res.body.title).toBe('Elevated Market Volatility');
    expect(res.body.learnMore.whatChanged).toEqual(['risk-first']);
  });
});
