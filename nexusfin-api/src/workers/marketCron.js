const cron = require('node-cron');
const { env } = require('../config/env');

const buildTasks = (config = env) => [
  {
    name: 'market-us',
    schedule: `*/${Math.max(1, config.cronMarketIntervalMinutes)} * * * *`,
    run: async () => ({ scanned: 0, generated: 0, market: 'us' })
  },
  {
    name: 'market-crypto',
    schedule: `*/${Math.max(1, config.cronCryptoIntervalMinutes)} * * * *`,
    run: async () => ({ scanned: 0, generated: 0, market: 'crypto' })
  },
  {
    name: 'market-forex',
    schedule: `*/${Math.max(1, config.cronForexIntervalMinutes)} * * * *`,
    run: async () => ({ scanned: 0, generated: 0, market: 'forex' })
  },
  {
    name: 'market-commodity',
    schedule: `*/${Math.max(1, config.cronCommodityIntervalMinutes)} * * * *`,
    run: async () => ({ scanned: 0, generated: 0, market: 'commodity' })
  }
];

const startMarketCron = (options = {}) => {
  const enabled = options.enabled ?? env.cronEnabled;
  const logger = options.logger ?? console;
  const tasks = options.tasks ?? buildTasks();

  if (!enabled) {
    return {
      enabled: false,
      stop: () => {}
    };
  }

  const jobs = [];

  for (const task of tasks) {
    const job = cron.schedule(
      task.schedule,
      async () => {
        try {
          const out = await task.run();
          logger.log(`[cron:${task.name}] ok`, out);
        } catch (error) {
          logger.error(`[cron:${task.name}] failed`, error?.message || error);
        }
      },
      { timezone: 'UTC' }
    );
    jobs.push(job);
  }

  return {
    enabled: true,
    stop: () => {
      for (const job of jobs) job.stop();
    }
  };
};

module.exports = { startMarketCron, buildTasks };
