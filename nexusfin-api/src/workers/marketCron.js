const cron = require('node-cron');
const { env } = require('../config/env');

const ET_ZONE = 'America/New_York';

const toEtParts = (date = new Date()) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    weekday: String(parts.weekday || '').toLowerCase(),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0)
  };
};

const isWeekdayEt = (date = new Date()) => {
  const day = toEtParts(date).weekday;
  return !['sat', 'sun'].includes(day);
};

const isUsMarketHoursEt = (date = new Date()) => {
  if (!isWeekdayEt(date)) return false;
  const { hour, minute } = toEtParts(date);
  const minutes = hour * 60 + minute;
  return minutes >= 570 && minutes < 960; // 09:30-16:00 ET
};

const scheduleIntervalMs = (schedule) => {
  const match = String(schedule || '').match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (!match) return null;
  const mins = Number(match[1]);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  return mins * 60 * 1000;
};

const toStopLossChecked = (out) => {
  if (Number.isFinite(Number(out?.stopLossChecked))) return Number(out.stopLossChecked);
  if (!Array.isArray(out?.results)) return 0;
  return out.results.reduce((acc, item) => acc + Number(item?.positionsScanned || 0), 0);
};

const toMetric = (out, key) => {
  const value = Number(out?.[key]);
  return Number.isFinite(value) ? value : 0;
};

const buildTasks = (config = env, runners = {}, clock = () => new Date()) => {
  const runIfRequestedDate = () => true;
  void clock;
  return [
    {
      name: 'news-fetch-daily',
      schedule: '30 16 * * 1-5',
      shouldRun: runIfRequestedDate,
      run: runners.newsFetchDaily || (() => require('../jobs/newsFetchDailyJob').run())
    },
    {
      name: 'market-snapshot-daily',
      schedule: '0 17 * * 1-5',
      shouldRun: runIfRequestedDate,
      run: runners.marketSnapshotDaily || (() => require('../jobs/marketSnapshotDaily').run())
    },
    {
      name: 'market-snapshot-crypto-fx',
      schedule: '0 0 * * *',
      timezone: 'UTC',
      shouldRun: runIfRequestedDate,
      run: runners.marketSnapshotCryptoFx || (() => require('../jobs/marketSnapshotDaily').runCryptoFx())
    },
    {
      name: 'metrics-daily',
      schedule: '30 17 * * 1-5',
      shouldRun: runIfRequestedDate,
      run: runners.metricsDaily || (() => require('../jobs/metricsDailyJob').run())
    },
    {
      name: 'regime-daily',
      schedule: '45 17 * * 1-5',
      shouldRun: runIfRequestedDate,
      run: runners.regimeDaily || (() => require('../jobs/regimeDailyJob').run())
    },
    {
      name: 'crisis-check',
      schedule: '50 17 * * 1-5',
      shouldRun: runIfRequestedDate,
      run: runners.crisisCheck || (() => require('../jobs/crisisDailyJob').run())
    },
    {
      name: 'recommendations-daily',
      schedule: '0 18 * * 1-5',
      shouldRun: runIfRequestedDate,
      run: runners.recommendationsDaily || (() => require('../jobs/recommendationsDailyJob').run())
    },
    {
      name: 'news-digest-daily',
      schedule: '15 18 * * 1-5',
      shouldRun: runIfRequestedDate,
      run: runners.newsDigestDaily || (() => require('../jobs/newsDigestDailyJob').run())
    },
    {
      name: 'portfolio-snapshot-daily',
      schedule: '30 18 * * 1-5',
      shouldRun: runIfRequestedDate,
      run: runners.portfolioSnapshotDaily || (() => require('../jobs/portfolioSnapshotDailyJob').run())
    },
    {
      name: 'fundamentals-weekly',
      schedule: '0 18 * * 0',
      shouldRun: runIfRequestedDate,
      run: runners.fundamentalsWeekly || (() => require('../jobs/fundamentalsWeeklyJob').run())
    },
    {
      name: 'macro-daily',
      schedule: String(config.cronMacroDailySchedule || '0 8 * * *'),
      shouldRun: runIfRequestedDate,
      run: runners.macroDaily || (async () => ({ generated: 0 }))
    }
  ];
};

const startMarketCron = (options = {}) => {
  const enabled = options.enabled ?? env.cronEnabled;
  const logger = options.logger ?? console;
  const now = options.now ?? (() => Date.now());
  const logRun = options.logRun;
  const tasks = options.tasks ?? buildTasks();

  const status = {
    enabled,
    lastRun: null,
    lastDuration: 0,
    symbolsScanned: 0,
    candidatesFound: 0,
    aiValidations: 0,
    aiConfirmations: 0,
    aiRejections: 0,
    aiFailures: 0,
    alertsGenerated: 0,
    stopLossChecked: 0,
    macroRuns: 0,
    portfolioRuns: 0,
    nextRun: null,
    errors: [],
    lastTask: null
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
    const intervalMs = scheduleIntervalMs(task.schedule);
    const job = cron.schedule(
      task.schedule,
      async () => {
        const startedAtMs = now();
        status.lastTask = task.name;
        status.nextRun = intervalMs ? new Date(startedAtMs + intervalMs).toISOString() : null;

        if (typeof task.shouldRun === 'function' && !task.shouldRun()) {
          return;
        }

        let runLogId = null;
        if (typeof logRun === 'function') {
          try {
            runLogId = await logRun({
              event: 'start',
              task: task.name,
              startedAt: new Date(startedAtMs).toISOString()
            });
          } catch {
            runLogId = null;
          }
        }

        try {
          const out = await task.run();
          logger.log(`[cron:${task.name}] ok`, out);
          const duration = Math.max(0, now() - startedAtMs);
          const alertsGenerated = Number(out?.alertsCreated ?? out?.generated ?? 0);
          const stopLossChecked = toStopLossChecked(out);
          const symbolsScanned = toMetric(out, 'symbolsScanned');
          const candidatesFound = toMetric(out, 'candidatesFound');
          const aiValidations = toMetric(out, 'aiValidations');
          const aiConfirmations = toMetric(out, 'aiConfirmations');
          const aiRejections = toMetric(out, 'aiRejections');
          const aiFailures = toMetric(out, 'aiFailures');
          status.lastRun = new Date(startedAtMs).toISOString();
          status.lastDuration = duration;
          status.symbolsScanned = symbolsScanned;
          status.candidatesFound = candidatesFound;
          status.aiValidations = aiValidations;
          status.aiConfirmations = aiConfirmations;
          status.aiRejections = aiRejections;
          status.aiFailures = aiFailures;
          status.alertsGenerated = Number.isFinite(alertsGenerated) ? alertsGenerated : 0;
          status.stopLossChecked = Number.isFinite(stopLossChecked) ? stopLossChecked : 0;
          if (task.name === 'macro-daily') {
            status.macroRuns = Number(out?.generated || 0);
          }
          if (task.name === 'portfolio-snapshot-daily') {
            status.portfolioRuns = Number(out?.generated || 0);
          }
          status.errors = [];

          if (typeof logRun === 'function') {
            await logRun({
              event: 'success',
              runId: runLogId,
              task: task.name,
              startedAt: new Date(startedAtMs).toISOString(),
              finishedAt: new Date(now()).toISOString(),
              durationMs: duration,
              symbolsScanned,
              candidatesFound,
              aiValidations,
              aiConfirmations,
              aiRejections,
              aiFailures,
              alertsGenerated: status.alertsGenerated,
              stopLossChecked: status.stopLossChecked,
              errors: []
            });
          }
        } catch (error) {
          const message = String(error?.message || error);
          logger.error(`[cron:${task.name}] failed`, message);
          status.lastRun = new Date(startedAtMs).toISOString();
          status.lastDuration = Math.max(0, now() - startedAtMs);
          status.errors = [{ task: task.name, message, ts: new Date().toISOString() }, ...status.errors].slice(0, 10);

          if (typeof logRun === 'function') {
            await logRun({
              event: 'failed',
              runId: runLogId,
              task: task.name,
              startedAt: new Date(startedAtMs).toISOString(),
              finishedAt: new Date(now()).toISOString(),
              durationMs: status.lastDuration,
              symbolsScanned: 0,
              candidatesFound: 0,
              aiValidations: 0,
              aiConfirmations: 0,
              aiRejections: 0,
              aiFailures: 0,
              alertsGenerated: 0,
              stopLossChecked: 0,
              errors: [message]
            });
          }
        }
      },
      { timezone: task.timezone || ET_ZONE }
    );
    jobs.push(job);
  }

  return {
    enabled: true,
    stop: () => {
      for (const job of jobs) job.stop();
    },
    getStatus: () => ({ ...status })
  };
};

module.exports = { startMarketCron, buildTasks, isUsMarketHoursEt, isWeekdayEt, scheduleIntervalMs, toStopLossChecked };
