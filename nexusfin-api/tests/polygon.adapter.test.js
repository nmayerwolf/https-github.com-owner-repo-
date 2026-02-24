const { createPolygonAdapter } = require('../src/providers/PolygonAdapter');

describe('PolygonAdapter', () => {
  test('normalizes snapshot response', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        ticker: {
          updated: 1700000000000,
          day: { c: 101.5, h: 103, l: 99, v: 12345 },
          prevDay: { c: 100 }
        }
      })
    }));

    const adapter = createPolygonAdapter({ apiKey: 'k', fetchImpl, timeoutMs: 2000 });
    const out = await adapter.getSnapshot({ symbol: 'AAPL', assetClass: 'equity' });

    expect(out.last).toBe(101.5);
    expect(out.changeAbs).toBeCloseTo(1.5);
    expect(out.changePct).toBeCloseTo(1.5);
    expect(out.sources[0].vendor).toBe('polygon');
  });
});
