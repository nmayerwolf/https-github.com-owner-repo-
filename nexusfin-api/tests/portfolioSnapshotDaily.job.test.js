process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../src/services/jobRunTracker', () => ({
  withTrackedJobRun: jest.fn(async ({ run }) => run('2026-02-20'))
}));

const { query } = require('../src/config/db');
const { runCore } = require('../src/jobs/portfolioSnapshotDailyJob');

describe('portfolioSnapshotDaily job', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('creates snapshot and metrics for active portfolio', async () => {
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM portfolios p') && text.includes('EXISTS')) {
        return { rows: [{ id: 'pf-1', user_id: 'u1', name: 'Core' }] };
      }
      if (text.includes('FROM market_daily_bars') && text.includes('COALESCE(bar_date, date) =')) {
        return { rows: [{ symbol: 'AAPL', close: 150 }] };
      }
      if (text.includes('FROM fundamentals_snapshot')) {
        return { rows: [{ symbol: 'AAPL', sector: 'Technology' }] };
      }
      if (text.includes('FROM regime_state')) {
        return { rows: [{ regime: 'risk_on', volatility_regime: 'normal', leadership: ['Technology'] }] };
      }
      if (text.includes('FROM market_metrics_daily') && text.includes('sma_50')) {
        return { rows: [{ symbol: 'AAPL', sma_50: 120 }] };
      }
      if (text.includes('FROM universe_symbols')) {
        return { rows: [{ symbol: 'AAPL', category: 'equity' }] };
      }
      if (text.includes('FROM positions') && text.includes('portfolio_id = $1') && text.includes('sell_date IS NULL')) {
        return { rows: [{ symbol: 'AAPL', qty: 2, avg_cost: 100, category: 'equity' }] };
      }
      if (text.includes('FROM portfolio_snapshots') && text.includes('COALESCE(snapshot_date, date) <')) {
        return { rows: [{ total_value: 180 }] };
      }
      if (text.includes('FROM portfolio_snapshots') && text.includes('LIMIT 20')) {
        return { rows: [{ total_value: 300 }, { total_value: 250 }] };
      }
      if (text.includes('WHERE symbol = \'SPY\'')) {
        return { rows: [{ close: 420 }, { close: 400 }] };
      }
      if (text.includes('FROM user_agent_profile')) {
        return { rows: [{ risk_level: 0.5, horizon: 0.6, focus: 0.5 }] };
      }
      return { rows: [] };
    });

    const out = await runCore('2026-02-20');

    expect(out.processed).toBe(1);
    expect(out.failed).toBe(0);
    const snapshotInsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO portfolio_snapshots'));
    const metricsInsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO portfolio_metrics'));
    expect(snapshotInsert).toBeTruthy();
    expect(metricsInsert).toBeTruthy();
  });
});
