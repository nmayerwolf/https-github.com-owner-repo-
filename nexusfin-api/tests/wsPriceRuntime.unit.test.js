process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { startWsPriceRuntime, resolveRealtimeQuote, extractLatestAVValue } = require('../src/index');

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

    const runtime = startWsPriceRuntime({
      wsHub,
      finnhubSvc,
      alphaSvc: { commodity: jest.fn() },
      intervalSeconds: 1,
      logger: { warn: jest.fn() }
    });

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

    const runtime = startWsPriceRuntime({
      wsHub,
      finnhubSvc,
      alphaSvc: { commodity: jest.fn() },
      intervalSeconds: 1,
      logger: { warn: jest.fn() }
    });

    await jest.advanceTimersByTimeAsync(5000);

    expect(finnhubSvc.quote).not.toHaveBeenCalled();
    expect(wsHub.broadcastPrice).not.toHaveBeenCalled();

    runtime.stop();
  });

  test('uses alpha vantage for AV macro symbols', async () => {
    const wsHub = {
      getSubscribedSymbols: jest.fn(() => ['AV:GOLD']),
      broadcastPrice: jest.fn()
    };
    const finnhubSvc = {
      quote: jest.fn()
    };
    const alphaSvc = {
      commodity: jest.fn(async () => ({ data: [{ value: '2890.11' }] }))
    };

    const runtime = startWsPriceRuntime({ wsHub, finnhubSvc, alphaSvc, intervalSeconds: 1, logger: { warn: jest.fn() } });

    await jest.advanceTimersByTimeAsync(5000);

    expect(alphaSvc.commodity).toHaveBeenCalledWith('GOLD', {});
    expect(finnhubSvc.quote).not.toHaveBeenCalled();
    expect(wsHub.broadcastPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'AV:GOLD',
        price: 2890.11
      })
    );

    runtime.stop();
  });
});

describe('realtime quote helpers', () => {
  test('extractLatestAVValue picks first finite value', () => {
    expect(extractLatestAVValue({ data: [{ value: 'nan' }, { value: '30.5' }] })).toBe(30.5);
  });

  test('resolveRealtimeQuote handles finnhub and AV symbols', async () => {
    const finnhubSvc = {
      quote: jest.fn(async () => ({ c: 100.2, dp: 1.2 }))
    };
    const alphaSvc = {
      commodity: jest.fn(async () => ({ data: [{ value: '123.4' }] }))
    };

    const stock = await resolveRealtimeQuote('AAPL', { finnhubSvc, alphaSvc });
    expect(stock).toEqual(
      expect.objectContaining({
        symbol: 'AAPL',
        price: 100.2,
        change: 1.2,
        provider: 'finnhub'
      })
    );

    const macro = await resolveRealtimeQuote('AV:WTI', { finnhubSvc, alphaSvc });
    expect(macro).toEqual(
      expect.objectContaining({
        symbol: 'AV:WTI',
        price: 123.4,
        provider: 'alphavantage'
      })
    );
    expect(alphaSvc.commodity).toHaveBeenCalledWith('WTI', {});
  });

  test('resolveRealtimeQuote passes maturity for treasury yield symbols', async () => {
    const finnhubSvc = {
      quote: jest.fn(async () => ({ c: 100.2, dp: 1.2 }))
    };
    const alphaSvc = {
      commodity: jest.fn(async () => ({ data: [{ value: '4.45' }] }))
    };

    const treasury = await resolveRealtimeQuote('AV:TREASURY_YIELD:10YEAR', { finnhubSvc, alphaSvc });
    expect(treasury).toEqual(
      expect.objectContaining({
        symbol: 'AV:TREASURY_YIELD:10YEAR',
        price: 4.45,
        provider: 'alphavantage'
      })
    );
    expect(alphaSvc.commodity).toHaveBeenCalledWith('TREASURY_YIELD', { maturity: '10year' });
  });
});
