const cron = require('node-cron');
const { env } = require('../config/env');

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

const buildTasks = (_config = env, runners = {}) => [
  {
    name: 'data-ingestion',
    schedule: '0 5 * * *',
    run: runners.dataIngestion || (async () => ({ ok: true, skipped: true }))
  },
  {
    name: 'brief-and-ideas-review',
    schedule: '30 6 * * *',
    run: runners.briefAndIdeasReview || (async () => ({ ok: true, skipped: true }))
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

  for (const task of tasks) {
    const job = cron.schedule(
      task.schedule,
      async () => {
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
