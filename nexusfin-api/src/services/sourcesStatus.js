const { env } = require('../config/env');
const { query } = require('../config/db');

const createSourcesStatusService = ({ queryImpl = query, envImpl = env } = {}) => {
  const getStatus = async () => {
    const runsOut = await queryImpl(
      `SELECT DISTINCT ON (run_kind)
          run_kind,
          status,
          started_at,
          finished_at,
          error_message
       FROM runs
       ORDER BY run_kind, started_at DESC`
    );

    const countsOut = await queryImpl(
      `SELECT
          (SELECT COUNT(*)::int FROM market_snapshots WHERE ts >= NOW() - INTERVAL '24 hours') AS market_snapshots_24h,
          (SELECT COUNT(*)::int FROM price_bars WHERE ts >= NOW() - INTERVAL '24 hours') AS price_bars_24h,
          (SELECT COUNT(*)::int FROM fundamentals WHERE as_of >= NOW() - INTERVAL '24 hours') AS fundamentals_24h,
          (SELECT COUNT(*)::int FROM earnings_events WHERE created_at >= NOW() - INTERVAL '24 hours') AS earnings_24h,
          (SELECT COUNT(*)::int FROM news_items WHERE published_at >= NOW() - INTERVAL '24 hours') AS news_24h`
    );

    return {
      ok: true,
      timezone: envImpl.cronTimezone || 'America/Argentina/Buenos_Aires',
      providers: {
        market: { vendor: 'polygon', configured: Boolean(envImpl.polygonApiKey) },
        fundamentals: { vendor: 'fmp', configured: Boolean(envImpl.fmpApiKey) },
        news: { vendor: 'newsapi', configured: Boolean(envImpl.newsApiKey) },
        backfill: { vendor: 'newsapi', mode: 'historical_query', configured: Boolean(envImpl.newsApiKey) }
      },
      counts24h: countsOut.rows?.[0] || {},
      lastRuns: runsOut.rows || [],
      ts: new Date().toISOString()
    };
  };

  return { getStatus };
};

module.exports = { createSourcesStatusService };
