const express = require('express');
const request = require('supertest');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const { query } = require('../src/config/db');
const agentRoutes = require('../src/routes/agent');
const { errorHandler } = require('../src/middleware/errorHandler');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', email: 'user@mail.com' };
    next();
  });
  app.use('/api/agent', agentRoutes);
  app.use(errorHandler);
  return app;
};

describe('agent routes', () => {
  beforeEach(() => query.mockReset());

  it('returns defaults when profile does not exist', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ preset_type: 'balanced', risk_level: '0.5', horizon: '0.5', focus: '0.5', language: 'es' }]
      });

    const res = await request(makeApp()).get('/api/agent/profile');

    expect(res.status).toBe(200);
    expect(res.body.preset_type).toBe('balanced');
    expect(res.body.risk_level).toBe(0.5);
    expect(res.body.language).toBe('es');
  });

  it('upserts profile on PUT', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          preset_type: 'strategic_core',
          risk_level: '0.300',
          horizon: '0.800',
          focus: '0.200',
          language: 'en',
          preferred_tags: ['rates']
        }
      ]
    });

    const res = await request(makeApp()).put('/api/agent/profile').send({
      presetType: 'strategic_core',
      riskLevel: 0.3,
      horizon: 0.8,
      focus: 0.2,
      language: 'en',
      preferredTags: ['rates'],
      notificationMode: 'digest_only'
    });

    expect(res.status).toBe(200);
    expect(res.body.preset_type).toBe('strategic_core');
    expect(res.body.risk_level).toBe(0.3);
    expect(res.body.language).toBe('en');
  });
});
