const { createSourcesStatusService } = require('../src/services/sourcesStatus');

describe('sourcesStatus service', () => {
  test('returns provider configuration, counts and runs', async () => {
    const queryImpl = jest.fn(async (sql) => {
      if (sql.includes('SELECT DISTINCT ON (run_kind)')) {
        return {
          rows: [
            {
              run_kind: 'ingest_news',
              status: 'success',
              started_at: '2026-02-24T08:20:00.000Z',
              finished_at: '2026-02-24T08:20:20.000Z',
              error_message: null
            }
          ]
        };
      }
      if (sql.includes('WHERE error_message ILIKE')) {
        return {
          rows: [
            { run_kind: 'ingest_earnings_calendar', started_at: '2026-02-24T09:00:00.000Z', error_message: 'FMP HTTP 429' },
            { run_kind: 'ingest_news', started_at: '2026-02-24T10:00:00.000Z', error_message: 'NewsAPI HTTP 429' }
          ]
        };
      }

      return {
        rows: [
          {
            market_snapshots_24h: 120,
            price_bars_24h: 300,
            fundamentals_24h: 55,
            earnings_24h: 20,
            news_24h: 80
          }
        ]
      };
    });

    const envImpl = {
      cronTimezone: 'America/Argentina/Buenos_Aires',
      polygonApiKey: 'p',
      fmpApiKey: 'f',
      newsApiKey: 'n'
    };

    const service = createSourcesStatusService({ queryImpl, envImpl });
    const out = await service.getStatus();

    expect(out.ok).toBe(true);
    expect(out.providers.market.vendor).toBe('polygon');
    expect(out.providers.market.configured).toBe(true);
    expect(out.providers.backfill.vendor).toBe('newsapi');
    expect(out.providers.backfill.configured).toBe(true);
    expect(out.counts24h.news_24h).toBe(80);
    expect(out.freshness.news_ok).toBe(true);
    expect(out.degradedProviders).toEqual(expect.arrayContaining(['fmp', 'newsapi']));
    expect(out.lastRateLimits.fmp).toBe('2026-02-24T09:00:00.000Z');
    expect(out.lastRuns).toHaveLength(1);
  });
});
