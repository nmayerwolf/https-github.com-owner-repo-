jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() }))
}));

const cron = require('node-cron');
const { buildTasks, startMarketCron } = require('../src/workers/marketCron');

describe('market cron scaffold', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildTasks uses configured intervals', () => {
    const tasks = buildTasks({
      cronMarketIntervalMinutes: 7,
      cronCryptoIntervalMinutes: 11,
      cronForexIntervalMinutes: 13,
      cronCommodityIntervalMinutes: 17
    });

    expect(tasks.map((t) => t.schedule)).toEqual(['*/7 * * * *', '*/11 * * * *', '*/13 * * * *', '*/17 * * * *']);
  });

  test('startMarketCron disabled does not register jobs', () => {
    const runtime = startMarketCron({ enabled: false });

    expect(runtime.enabled).toBe(false);
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
    expect(cron.schedule).toHaveBeenCalledTimes(2);

    runtime.stop();

    expect(firstStop).toHaveBeenCalledTimes(1);
    expect(secondStop).toHaveBeenCalledTimes(1);
  });
});
