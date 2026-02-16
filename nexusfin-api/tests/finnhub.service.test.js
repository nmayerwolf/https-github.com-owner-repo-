const { createFinnhubService } = require('../src/services/finnhub');

describe('finnhub service', () => {
  it('appends FINNHUB_KEY as token param', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    const svc = createFinnhubService({
      keyProvider: () => 'test-key',
      fetchImpl: fetchMock
    });

    await svc.quote('AAPL');
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('token=test-key');
  });

  it('throws when FINNHUB_KEY missing', async () => {
    const svc = createFinnhubService({
      keyProvider: () => '',
      fetchImpl: async () => ({ ok: true, json: async () => ({}) })
    });
    await expect(svc.quote('AAPL')).rejects.toThrow('Missing FINNHUB_KEY');
  });

  it('serializes requests with 1.3s spacing', async () => {
    let clockMs = 0;
    const waitCalls = [];
    const callTimes = [];
    const svc = createFinnhubService({
      minIntervalMs: 1300,
      now: () => clockMs,
      wait: async (ms) => {
        waitCalls.push(ms);
        clockMs += ms;
      },
      keyProvider: () => 'test-key',
      fetchImpl: async () => {
        callTimes.push(clockMs);
        return { ok: true, json: async () => ({}) };
      }
    });

    await Promise.all([svc.quote('AAPL'), svc.quote('MSFT'), svc.quote('TSLA')]);

    expect(waitCalls).toEqual([1300, 1300]);
    expect(callTimes).toEqual([0, 1300, 2600]);
  });
});
