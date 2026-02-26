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
          (SELECT COUNT(*)::int FROM fundamentals WHERE created_at >= NOW() - INTERVAL '24 hours') AS fundamentals_24h,
          (SELECT COUNT(*)::int FROM earnings_events WHERE created_at >= NOW() - INTERVAL '24 hours') AS earnings_24h,
          (SELECT COUNT(*)::int FROM news_items WHERE created_at >= NOW() - INTERVAL '24 hours') AS news_24h`
    );

    const rlOut = await queryImpl(
      `SELECT run_kind, started_at, error_message
       FROM runs
       WHERE error_message ILIKE '%429%'
          OR error_message ILIKE '%FMP_COOLING_DOWN%'
       ORDER BY started_at DESC
       LIMIT 50`
    );

    const counts = countsOut.rows?.[0] || {};
    const asNum = (v) => Number(v || 0);
    const freshness = {
      market_ok: asNum(counts.market_snapshots_24h) > 0,
      bars_ok: asNum(counts.price_bars_24h) > 0,
      fundamentals_ok: asNum(counts.fundamentals_24h) > 0,
      earnings_ok: asNum(counts.earnings_24h) > 0,
      news_ok: asNum(counts.news_24h) > 0
    };
    const lastRateLimits = { fmp: null, newsapi: null };
    for (const row of rlOut.rows || []) {
      const msg = String(row?.error_message || '').toLowerCase();
      const ts = row?.started_at || null;
      if (!ts) continue;
      if (!lastRateLimits.fmp && (row.run_kind === 'ingest_earnings_calendar' || msg.includes('fmp'))) lastRateLimits.fmp = ts;
      if (!lastRateLimits.newsapi && (row.run_kind === 'ingest_news' || row.run_kind === 'ingest_news_backfill' || msg.includes('newsapi'))) lastRateLimits.newsapi = ts;
      if (lastRateLimits.fmp && lastRateLimits.newsapi) break;
    }
    const degradedProviders = Object.entries(lastRateLimits)
      .filter(([, ts]) => Boolean(ts))
      .map(([provider]) => provider);

    return {
      ok: true,
      timezone: envImpl.cronTimezone || 'America/Argentina/Buenos_Aires',
      providers: {
        market: { vendor: 'polygon', configured: Boolean(envImpl.polygonApiKey) },
        fundamentals: { vendor: 'fmp', configured: Boolean(envImpl.fmpApiKey) },
        news: { vendor: 'newsapi', configured: Boolean(envImpl.newsApiKey) },
        backfill: { vendor: 'newsapi', mode: 'historical_query', configured: Boolean(envImpl.newsApiKey) }
      },
      counts24h: counts,
      freshness,
      degradedProviders,
      lastRateLimits,
      lastRuns: runsOut.rows || [],
      ts: new Date().toISOString()
    };
  };

  return { getStatus };
};

module.exports = { createSourcesStatusService };
