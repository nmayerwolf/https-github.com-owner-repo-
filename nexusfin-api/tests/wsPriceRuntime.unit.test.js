process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { startWsPriceRuntime } = require('../src/index');

describe('ws price runtime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('broadcasts quote prices for subscribed symbols', async () => {
    const wsHub = {
      getSubscribedSymbols: jest.fn(() => ['AAPL']),
      broadcastPrice: jest.fn()
    };
    const finnhubSvc = {
      quote: jest.fn(async () => ({ c: 123.45, dp: 2.1 }))
    };

    const runtime = startWsPriceRuntime({ wsHub, finnhubSvc, intervalSeconds: 1, logger: { warn: jest.fn() } });

    await jest.advanceTimersByTimeAsync(5000);

    expect(finnhubSvc.quote).toHaveBeenCalledWith('AAPL');
    expect(wsHub.broadcastPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'AAPL',
        price: 123.45,
        change: 2.1
      })
    );

    runtime.stop();
  });

  test('does not broadcast when there are no subscribed symbols', async () => {
    const wsHub = {
      getSubscribedSymbols: jest.fn(() => []),
      broadcastPrice: jest.fn()
    };
    const finnhubSvc = {
      quote: jest.fn()
    };

    const runtime = startWsPriceRuntime({ wsHub, finnhubSvc, intervalSeconds: 1, logger: { warn: jest.fn() } });

    await jest.advanceTimersByTimeAsync(5000);

    expect(finnhubSvc.quote).not.toHaveBeenCalled();
    expect(wsHub.broadcastPrice).not.toHaveBeenCalled();

    runtime.stop();
  });
});

