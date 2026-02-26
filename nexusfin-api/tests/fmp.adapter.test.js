const { createFmpAdapter } = require('../src/providers/FmpAdapter');

describe('FmpAdapter', () => {
  test('uses stable endpoints and maps earnings calendar', async () => {
    const fetchImpl = jest
      .fn(async (url) => {
        if (url.includes('/stable/profile')) {
          return { ok: true, json: async () => [{ mktCap: 1000, pe: 20, enterpriseValueOverEBITDA: 10, priceToSalesRatioTTM: 2 }] };
        }
        if (url.includes('/stable/income-statement')) {
          return { ok: true, json: async () => [{ date: '2026-02-24', revenue: 500, grossProfit: 200, operatingIncome: 100, netIncome: 80, ebitda: 120 }] };
        }
        if (url.includes('/stable/balance-sheet-statement')) {
          return { ok: true, json: async () => [{ date: '2026-02-24', totalDebt: 300, cashAndCashEquivalents: 100 }] };
        }
        if (url.includes('/stable/earnings-calendar')) {
          return { ok: true, json: async () => [{ symbol: 'AAPL', date: '2026-03-01', epsEstimated: 1.2, revenueEstimated: 1000 }] };
        }
        return { ok: false, status: 404, text: async () => 'not found' };
      });

    const adapter = createFmpAdapter({ apiKey: 'k', fetchImpl, timeoutMs: 2000 });
    const fundamentals = await adapter.getFundamentals({ symbol: 'AAPL', assetClass: 'equity' });
    const earnings = await adapter.getEarningsCalendar({ from: '2026-02-24', to: '2026-03-24' });

    expect(fundamentals.marketCap).toBe(1000);
    expect(fundamentals.netDebt).toBe(200);
    expect(earnings).toHaveLength(1);
    expect(earnings[0].asset.symbol).toBe('AAPL');
  });

  test('retries on 429 and succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => '0' },
        text: async () => 'rate limited'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ symbol: 'AAPL', date: '2026-03-01', epsEstimated: 1.2, revenueEstimated: 1000 }]
      });

    const adapter = createFmpAdapter({
      apiKey: 'k',
      fetchImpl,
      timeoutMs: 2000,
      maxRetries: 2,
      baseBackoffMs: 1
    });

    const earnings = await adapter.getEarningsCalendar({ from: '2026-02-24', to: '2026-03-24' });
    expect(earnings).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('enters cooldown after 429 and blocks subsequent calls', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => 'rate limited'
      });

    const adapter = createFmpAdapter({
      apiKey: 'k',
      fetchImpl,
      timeoutMs: 2000,
      maxRetries: 0,
      cooldownMs: 60_000
    });

    await expect(adapter.getEarningsCalendar({ from: '2026-02-24', to: '2026-03-24' })).rejects.toHaveProperty('status', 429);
    await expect(adapter.getEarningsCalendar({ from: '2026-02-24', to: '2026-03-24' })).rejects.toHaveProperty('code', 'FMP_COOLING_DOWN');
  });
});
