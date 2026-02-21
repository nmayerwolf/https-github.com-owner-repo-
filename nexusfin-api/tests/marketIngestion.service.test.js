const { createMarketIngestionService, computeSeriesMetrics, buildSectorPercentiles, buildNewsId, normalizeNewsRows } = require('../src/services/marketIngestion');

describe('marketIngestion helpers', () => {
  it('computes rolling metrics for daily bars', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const bars = Array.from({ length: 70 }, (_, i) => {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return {
        symbol: 'AAPL',
        date: d,
        close: 100 + i
      };
    });

    const out = computeSeriesMetrics(bars);
    expect(out.length).toBe(70);
    expect(out[out.length - 1].ret_1d).not.toBeNull();
    expect(out[out.length - 1].ret_1w).not.toBeNull();
    expect(out[out.length - 1].ret_1m).not.toBeNull();
    expect(out[out.length - 1].ret_3m).not.toBeNull();
    expect(out[out.length - 1].ma20).not.toBeNull();
    expect(out[out.length - 1].ma50).not.toBeNull();
  });

  it('builds sector percentiles per metric', () => {
    const out = buildSectorPercentiles([
      { symbol: 'A', sector: 'tech', pe: 10, ev_ebitda: 8, fcf_yield: 1 },
      { symbol: 'B', sector: 'tech', pe: 20, ev_ebitda: 10, fcf_yield: 3 },
      { symbol: 'C', sector: 'tech', pe: 30, ev_ebitda: 12, fcf_yield: 5 },
      { symbol: 'D', sector: 'energy', pe: 8, ev_ebitda: 7, fcf_yield: 4 }
    ]);

    const a = out.find((row) => row.symbol === 'A');
    const c = out.find((row) => row.symbol === 'C');
    expect(a.pe_percentile).toBeLessThan(c.pe_percentile);
    expect(a.fcf_yield_percentile).toBeLessThan(c.fcf_yield_percentile);
  });

  it('normalizes news rows and creates deterministic ids', () => {
    const inRows = [
      {
        ts: '2026-02-20T10:00:00.000Z',
        headline: 'Fed signals slower cuts',
        summary: 'Market reacts to policy path.',
        tags: ['macro'],
        tickers: ['spy'],
        url: 'https://news.test/fed'
      },
      {
        ts: '2026-02-20T11:00:00.000Z',
        headline: '  ',
        summary: 'invalid because missing headline'
      }
    ];

    const out = normalizeNewsRows(inRows);
    expect(out).toHaveLength(1);
    expect(out[0].tickers).toEqual(['SPY']);
    expect(out[0].id).toEqual(buildNewsId(inRows[0]));
  });
});

describe('marketIngestion runMarketSnapshotDaily', () => {
  it('returns ok:true with warnings when provider raises forbidden', async () => {
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('SELECT symbol FROM universe_symbols')) {
        return { rows: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }] };
      }
      return { rows: [] };
    });
    const provider = {
      getDailyBars: jest.fn(async () => {
        const err = new Error('FINNHUB_ENDPOINT_FORBIDDEN');
        err.code = 'FINNHUB_ENDPOINT_FORBIDDEN';
        err.status = 403;
        throw err;
      })
    };
    const service = createMarketIngestionService({ query, provider, logger: { log: jest.fn(), warn: jest.fn() } });

    const out = await service.runMarketSnapshotDaily({ date: '2026-02-21' });

    expect(out.ok).toBe(true);
    expect(out.job).toBe('market_snapshot_daily');
    expect(out.generated).toBe(0);
    expect(out.skipped).toBe(2);
    expect(Array.isArray(out.warnings)).toBe(true);
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});
