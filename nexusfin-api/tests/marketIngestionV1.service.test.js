const { createMarketIngestionV1Service } = require('../src/services/marketIngestionV1');

describe('marketIngestionV1 service', () => {
  test('runIngestion executes all steps and returns ok', async () => {
    let runSeq = 0;
    const query = jest.fn(async (sql) => {
      if (sql.includes('INSERT INTO runs') && sql.includes('RETURNING run_id')) {
        runSeq += 1;
        return { rows: [{ run_id: `run-${runSeq}` }] };
      }
      if (sql.includes('SELECT DISTINCT ON (asset_id)')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT news_id')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const adapters = {
      polygon: {
        getSnapshot: jest.fn(async (asset) => ({
          asset,
          ts: '2026-02-23T10:00:00Z',
          last: 100,
          changeAbs: 1,
          changePct: 1,
          dayHigh: 101,
          dayLow: 99,
          volume: 1000,
          currency: 'USD',
          sources: [{ vendor: 'polygon', vendorSymbol: asset.symbol }]
        })),
        getBars: jest.fn(async (asset) => [
          {
            asset,
            ts: '2026-02-23T00:00:00Z',
            open: 99,
            high: 101,
            low: 98,
            close: 100,
            volume: 2000,
            currency: 'USD',
            sources: [{ vendor: 'polygon', vendorSymbol: asset.symbol }]
          }
        ])
      },
      fmp: {
        getFundamentals: jest.fn(async () => ({
          asOf: '2026-02-23T00:00:00Z',
          currency: 'USD',
          marketCap: 1000,
          revenueTTM: 500,
          grossMarginTTM: 0.4,
          operatingMarginTTM: 0.3,
          netMarginTTM: 0.2,
          fcfTTM: 100,
          netDebt: 50,
          debtToEbitda: 1.2,
          peTTM: 20,
          evToEbitdaTTM: 10,
          priceToSalesTTM: 2,
          raw: {},
          sources: [{ vendor: 'fmp', vendorSymbol: 'AAPL' }]
        })),
        getEarningsCalendar: jest.fn(async () => [
          {
            asset: { symbol: 'AAPL', assetClass: 'equity' },
            fiscalPeriod: 'Q4',
            reportDate: '2026-03-01T00:00:00Z',
            timeOfDay: 'UNKNOWN',
            epsEstimate: 1,
            revenueEstimate: 100,
            sources: [{ vendor: 'fmp', vendorSymbol: 'AAPL' }]
          }
        ])
      },
      newsApi: {
        getTopHeadlines: jest.fn(async () => [
          {
            ts: '2026-02-23T10:00:00Z',
            title: 'Fed rates update',
            description: 'Macro headline',
            sourceName: 'Reuters',
            url: 'https://example.com/1',
            sources: [{ vendor: 'newsapi', url: 'https://example.com/1' }]
          }
        ]),
        getEverything: jest.fn(async () => [])
      },
    };

    const svc = createMarketIngestionV1Service({ query, adapters, logger: { warn: jest.fn() } });
    const out = await svc.runIngestion({ date: '2026-02-23' });

    expect(out.ok).toBe(true);
    expect(out.results.snapshots.ok).toBe(true);
    expect(out.results.news.ok).toBe(true);
    expect(out.results.backfill.ok).toBe(true);
    expect(out.results.fundamentals.ok).toBe(true);
  });

  test('ingestFundamentals tolerates missing numeric values', async () => {
    let runSeq = 0;
    const query = jest.fn(async (sql) => {
      if (sql.includes('INSERT INTO runs') && sql.includes('RETURNING run_id')) {
        runSeq += 1;
        return { rows: [{ run_id: `run-${runSeq}` }] };
      }
      return { rows: [] };
    });

    const adapters = {
      polygon: { getSnapshot: jest.fn(), getBars: jest.fn() },
      fmp: {
        getFundamentals: jest.fn(async () => ({
          asOf: '2026-02-23T00:00:00Z',
          currency: 'USD',
          marketCap: null,
          revenueTTM: null,
          grossMarginTTM: null,
          operatingMarginTTM: null,
          netMarginTTM: null,
          fcfTTM: null,
          netDebt: null,
          debtToEbitda: null,
          peTTM: null,
          evToEbitdaTTM: null,
          priceToSalesTTM: null,
          raw: {},
          sources: [{ vendor: 'fmp', vendorSymbol: 'AAPL' }]
        })),
        getEarningsCalendar: jest.fn(async () => [])
      },
      newsApi: { getTopHeadlines: jest.fn(async () => []), getEverything: jest.fn(async () => []) }
    };

    const svc = createMarketIngestionV1Service({ query, adapters, logger: { warn: jest.fn() } });
    const out = await svc.ingestFundamentals({ date: '2026-02-23' });
    expect(out.ok).toBe(true);
    expect(out.error).toBeUndefined();
  });

  test('ingestFundamentals retries when prior run exists but freshness is stale', async () => {
    let runSeq = 0;
    const query = jest.fn(async (sql) => {
      if (sql.includes('INSERT INTO runs') && sql.includes('RETURNING run_id')) {
        runSeq += 1;
        return { rows: [{ run_id: `run-${runSeq}` }] };
      }
      if (sql.includes('FROM runs') && sql.includes("config->>'runDate'")) {
        return { rows: [{}] };
      }
      if (sql.includes('FROM fundamentals') && sql.includes('created_at')) {
        return { rows: [{ total: 0 }] };
      }
      return { rows: [] };
    });

    const adapters = {
      polygon: { getSnapshot: jest.fn(), getBars: jest.fn() },
      fmp: {
        getFundamentals: jest.fn(async () => ({
          asOf: '2026-02-23T00:00:00Z',
          currency: 'USD',
          marketCap: 1000,
          revenueTTM: 500,
          grossMarginTTM: 0.4,
          operatingMarginTTM: 0.3,
          netMarginTTM: 0.2,
          fcfTTM: 100,
          netDebt: 50,
          debtToEbitda: 1.2,
          peTTM: 20,
          evToEbitdaTTM: 10,
          priceToSalesTTM: 2,
          raw: {},
          sources: [{ vendor: 'fmp', vendorSymbol: 'AAPL' }]
        })),
        getEarningsCalendar: jest.fn(async () => [])
      },
      newsApi: { getTopHeadlines: jest.fn(async () => []), getEverything: jest.fn(async () => []) }
    };

    const svc = createMarketIngestionV1Service({ query, adapters, logger: { warn: jest.fn() } });
    const out = await svc.ingestFundamentals({ date: '2026-02-23' });
    expect(out.ok).toBe(true);
    expect(out.alreadyIngested).toBeUndefined();
    expect(adapters.fmp.getFundamentals).toHaveBeenCalled();
  });

  test('ingestNews returns degraded on provider 429', async () => {
    let runSeq = 0;
    const query = jest.fn(async (sql) => {
      if (sql.includes('INSERT INTO runs') && sql.includes('RETURNING run_id')) {
        runSeq += 1;
        return { rows: [{ run_id: `run-${runSeq}` }] };
      }
      if (sql.includes('FROM runs') && sql.includes("config->>'runDate'")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const rateErr = new Error('NewsAPI /everything HTTP 429');
    rateErr.status = 429;
    const adapters = {
      polygon: { getSnapshot: jest.fn(), getBars: jest.fn() },
      fmp: { getFundamentals: jest.fn(), getEarningsCalendar: jest.fn() },
      newsApi: { getTopHeadlines: jest.fn(async () => { throw rateErr; }), getEverything: jest.fn(async () => []) }
    };

    const svc = createMarketIngestionV1Service({ query, adapters, logger: { warn: jest.fn() } });
    const out = await svc.ingestNews({ date: '2026-02-23' });
    expect(out.ok).toBe(true);
    expect(out.degraded).toBe(true);
    expect(out.rateLimited).toBe(true);
  });
});
