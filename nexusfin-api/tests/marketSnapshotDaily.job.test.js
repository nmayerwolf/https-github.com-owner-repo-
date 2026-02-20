process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../src/services/finnhub', () => ({
  quote: jest.fn(),
  cryptoCandles: jest.fn(),
  forexCandles: jest.fn()
}));
jest.mock('../src/services/jobRunTracker', () => ({
  withTrackedJobRun: jest.fn(async ({ run }) => run())
}));

const { query } = require('../src/config/db');
const finnhub = require('../src/services/finnhub');
const { runCore } = require('../src/jobs/marketSnapshotDaily');

describe('marketSnapshotDaily job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('populates bars for today from active universe', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          { symbol: 'AAPL', category: 'equity' },
          { symbol: 'BTCUSDT', category: 'crypto' }
        ]
      })
      .mockResolvedValue({ rows: [] });

    finnhub.quote.mockResolvedValue({ o: 100, h: 110, l: 95, c: 105, v: 10, pc: 100, dp: 5 });
    finnhub.cryptoCandles.mockResolvedValue({
      o: [50000, 50500],
      h: [51000, 51200],
      l: [49500, 50000],
      c: [50500, 51000],
      v: [1000, 1200]
    });

    const out = await runCore({ waitMs: 0 });

    expect(out.total).toBe(2);
    expect(out.ok).toBe(2);
    const upsertCalls = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO market_daily_bars'));
    expect(upsertCalls.length).toBeGreaterThanOrEqual(1);
    expect(Number(upsertCalls[0][1][4])).toBeGreaterThan(0);
  });
});
