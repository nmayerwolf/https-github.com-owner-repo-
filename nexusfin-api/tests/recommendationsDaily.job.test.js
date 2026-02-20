process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../src/engines/ideasEngine', () => ({
  selectCandidates: jest.fn(async () => ({ strategic: [], opportunistic: [], risk: [] })),
  generateIdeas: jest.fn(async () => ({
    model: 'claude-haiku-4-5-20251001',
    usage: { input_tokens: 10, output_tokens: 10 },
    mode: 'ai',
    ideas: [
      { category: 'strategic', symbol: 'AAPL', action: 'BUY', confidence: 0.9, timeframe: 'months', invalidation: 'x', rationale: ['a'], risks: ['r'], tags: ['t'] },
      { category: 'strategic', symbol: 'MSFT', action: 'BUY', confidence: 0.8, timeframe: 'months', invalidation: 'x', rationale: ['a'], risks: ['r'], tags: ['t'] },
      { category: 'opportunistic', symbol: 'TSLA', action: 'WATCH', confidence: 0.85, timeframe: 'weeks', invalidation: 'x', rationale: ['a'], risks: ['r'], tags: ['t'] },
      { category: 'opportunistic', symbol: 'PFE', action: 'WATCH', confidence: 0.5, timeframe: 'weeks', invalidation: 'x', rationale: ['a'], risks: ['r'], tags: ['t'] },
      { category: 'risk', title: 'Volatility', severity: 'high', bullets: ['risk'], tags: ['risk'] }
    ]
  }))
}));

const { query } = require('../src/config/db');
const { runCore } = require('../src/jobs/recommendationsDailyJob');

describe('recommendationsDailyJob', () => {
  beforeEach(() => query.mockReset());

  test('crisis mode lowers idea caps and appends crisis_mode tag', async () => {
    const writes = [];
    query.mockImplementation(async (sql, params = []) => {
      const text = String(sql);
      if (text.includes('FROM regime_state')) return { rows: [{ regime: 'risk_on', volatility_regime: 'crisis', leadership: [], risk_flags: [], confidence: 0.8 }] };
      if (text.includes('FROM crisis_state')) return { rows: [{ is_active: true }] };
      if (text.includes('FROM market_metrics_daily')) return { rows: [] };
      if (text.includes('FROM market_daily_bars')) return { rows: [] };
      if (text.includes('DELETE FROM base_ideas')) return { rows: [] };
      if (text.includes('INSERT INTO base_ideas')) return { rows: [] };
      if (text.includes('FROM users u')) return { rows: [{ id: 'u1', focus: 0.8, risk_level: 0.5, horizon: 0.5 }] };
      if (text.includes('INSERT INTO user_recommendations')) {
        writes.push(JSON.parse(params[2]));
        return { rows: [] };
      }
      return { rows: [] };
    });

    await runCore('2026-02-20');
    expect(writes).toHaveLength(1);
    const items = writes[0];
    const strategic = items.filter((x) => x.category === 'strategic');
    const opportunistic = items.filter((x) => x.category === 'opportunistic');
    expect(strategic.length).toBeLessThanOrEqual(2);
    expect(opportunistic.length).toBeLessThanOrEqual(1);
    expect(items.every((x) => Array.isArray(x.tags) && x.tags.includes('crisis_mode'))).toBe(true);
  });

  test('low risk level raises confidence threshold', async () => {
    const writes = [];
    query.mockImplementation(async (sql, params = []) => {
      const text = String(sql);
      if (text.includes('FROM regime_state')) return { rows: [{ regime: 'risk_on', volatility_regime: 'normal', leadership: [], risk_flags: [], confidence: 0.8 }] };
      if (text.includes('FROM crisis_state')) return { rows: [{ is_active: false }] };
      if (text.includes('FROM market_metrics_daily')) return { rows: [] };
      if (text.includes('FROM market_daily_bars')) return { rows: [] };
      if (text.includes('DELETE FROM base_ideas')) return { rows: [] };
      if (text.includes('INSERT INTO base_ideas')) return { rows: [] };
      if (text.includes('FROM users u')) return { rows: [{ id: 'u1', focus: 0.5, risk_level: 0.2, horizon: 0.5 }] };
      if (text.includes('INSERT INTO user_recommendations')) {
        writes.push(JSON.parse(params[2]));
        return { rows: [] };
      }
      return { rows: [] };
    });

    await runCore('2026-02-20');
    const items = writes[0];
    expect(items.some((x) => x.symbol === 'MSFT')).toBe(true);
    expect(items.some((x) => x.symbol === 'TSLA')).toBe(true);
    expect(items.some((x) => x.symbol === 'PFE')).toBe(false);
  });
});
