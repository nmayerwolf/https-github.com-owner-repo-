jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() }))
}));

const cron = require('node-cron');
const { buildTasks, startMarketCron, isUsMarketHoursEt, isWeekdayEt, scheduleIntervalMs, toStopLossChecked } = require('../src/workers/marketCron');

describe('market cron scaffold', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildTasks uses configured intervals', () => {
    const tasks = buildTasks({
      cronMarketIntervalMinutes: 7,
      cronCryptoIntervalMinutes: 11,
      cronForexIntervalMinutes: 13,
      cronCommodityIntervalMinutes: 17,
      cronMacroDailySchedule: '0 8 * * *',
      cronPortfolioDailySchedule: '15 8 * * *'
    });

    expect(tasks.map((t) => t.schedule)).toEqual(['*/7 * * * *', '*/11 * * * *', '*/13 * * * *', '*/17 * * * *', '0 8 * * *', '15 8 * * *']);
  });

  test('market hour helpers evaluate ET windows', () => {
    expect(isWeekdayEt(new Date('2026-02-16T15:00:00Z'))).toBe(true);
    expect(isUsMarketHoursEt(new Date('2026-02-16T15:00:00Z'))).toBe(true); // 10:00 ET
    expect(isUsMarketHoursEt(new Date('2026-02-16T00:00:00Z'))).toBe(false); // after hours
    expect(isWeekdayEt(new Date('2026-02-15T15:00:00Z'))).toBe(false); // sunday
  });

  test('scheduleIntervalMs parses minute cron expressions', () => {
    expect(scheduleIntervalMs('*/5 * * * *')).toBe(300000);
    expect(scheduleIntervalMs('0 * * * *')).toBeNull();
  });

  test('toStopLossChecked aggregates result positionsScanned', () => {
    expect(toStopLossChecked({ stopLossChecked: 4 })).toBe(4);
    expect(toStopLossChecked({ results: [{ positionsScanned: 2 }, { positionsScanned: 3 }] })).toBe(5);
    expect(toStopLossChecked({})).toBe(0);
  });

  test('startMarketCron disabled does not register jobs', () => {
    const runtime = startMarketCron({ enabled: false });

    expect(runtime.enabled).toBe(false);
    expect(runtime.getStatus().enabled).toBe(false);
    expect(cron.schedule).not.toHaveBeenCalled();
  });

  test('startMarketCron enabled registers jobs and stop stops each one', () => {
    const firstStop = jest.fn();
    const secondStop = jest.fn();

    cron.schedule
      .mockReturnValueOnce({ stop: firstStop })
      .mockReturnValueOnce({ stop: secondStop });

    const runtime = startMarketCron({
      enabled: true,
      tasks: [
        { name: 'one', schedule: '*/5 * * * *', run: async () => ({}) },
        { name: 'two', schedule: '*/10 * * * *', run: async () => ({}) }
      ],
      logger: { log: jest.fn(), error: jest.fn() }
    });

    expect(runtime.enabled).toBe(true);
    expect(typeof runtime.getStatus).toBe('function');
    expect(cron.schedule).toHaveBeenCalledTimes(2);

    runtime.stop();

    expect(firstStop).toHaveBeenCalledTimes(1);
    expect(secondStop).toHaveBeenCalledTimes(1);
  });
});
