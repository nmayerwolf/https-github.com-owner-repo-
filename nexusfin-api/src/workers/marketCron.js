const cron = require('node-cron');
const { env } = require('../config/env');

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

const buildTasks = (_config = env, runners = {}) => [
  {
    name: 'ingest_market_snapshots',
    schedule: '0 5 * * *',
    run: runners.ingestMarketSnapshots || (async () => ({ ok: true, skipped: true }))
  },
  {
    name: 'ingest_price_bars',
    schedule: '5 5 * * *',
    run: runners.ingestPriceBars || (async () => ({ ok: true, skipped: true }))
  },
  {
    name: 'ingest_fundamentals',
    schedule: '10 5 * * *',
    run: runners.ingestFundamentals || (async () => ({ ok: true, skipped: true }))
  },
  {
    name: 'ingest_earnings_calendar',
    schedule: '15 5 * * *',
    run: runners.ingestEarningsCalendar || (async () => ({ ok: true, skipped: true }))
  },
  {
    name: 'ingest_news',
    schedule: '20 5 * * *',
    run: runners.ingestNews || (async () => ({ ok: true, skipped: true }))
  },
  {
    name: 'ingest_news_backfill',
    schedule: '25 5 * * *',
    run: runners.ingestNewsBackfill || (async () => ({ ok: true, skipped: true }))
  },
  {
    name: 'compute_relevance_scores',
    schedule: '30 5 * * *',
    run: runners.computeRelevanceScores || (async () => ({ ok: true, skipped: true }))
  },
  {
    name: 'generate_brief',
    schedule: '30 6 * * *',
    run: runners.generateBrief || (async () => ({ ok: true, skipped: true }))
  },
  {
    name: 'review_ideas',
    schedule: '31 6 * * *',
    run: runners.reviewIdeas || (async () => ({ ok: true, skipped: true }))
  }
];

const startMarketCron = ({ enabled = env.cronEnabled, timezone = env.cronTimezone || DEFAULT_TIMEZONE, tasks = buildTasks(), logger = console } = {}) => {
  const status = {
    enabled,
    timezone,
    lastRun: null,
    nextRun: null,
    lastTask: null,
    lastDurationMs: 0,
    results: {},
    errors: []
  };

  if (!enabled) {
    return {
      enabled: false,
      stop: () => {},
      getStatus: () => ({ ...status })
    };
  }

  const jobs = [];
  const runningTasks = new Set();

  for (const task of tasks) {
    const job = cron.schedule(
      task.schedule,
      async () => {
        if (runningTasks.has(task.name)) {
          status.results[task.name] = { ok: true, skipped: true, reason: 'TASK_ALREADY_RUNNING' };
          return;
        }
        runningTasks.add(task.name);
        const startedAt = Date.now();
        status.lastTask = task.name;
        status.lastRun = new Date(startedAt).toISOString();

        try {
          const out = await task.run();
          status.results[task.name] = out || {};
          status.lastDurationMs = Math.max(0, Date.now() - startedAt);
          status.errors = [];
          logger.log(`[cron:${task.name}] ok`, out);
        } catch (error) {
          status.lastDurationMs = Math.max(0, Date.now() - startedAt);
          status.errors = [{ task: task.name, message: String(error?.message || error), ts: new Date().toISOString() }, ...status.errors].slice(0, 10);
          logger.error(`[cron:${task.name}] failed`, error?.message || error);
        } finally {
          runningTasks.delete(task.name);
        }
      },
      { timezone }
    );

    jobs.push(job);
  }

  return {
    enabled: true,
    stop: () => jobs.forEach((job) => job.stop()),
    getStatus: () => ({ ...status })
  };
};

module.exports = { startMarketCron, buildTasks };
