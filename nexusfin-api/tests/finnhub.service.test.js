const { env } = require('../src/config/env');
const finnhub = require('../src/services/finnhub');

describe('finnhub service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    env.finnhubKey = 'test-key';
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('appends FINNHUB_KEY as token param', async () => {
    await finnhub.quote('AAPL');
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('token=test-key');
  });

  it('throws when FINNHUB_KEY missing', async () => {
    env.finnhubKey = '';
    await expect(finnhub.quote('AAPL')).rejects.toThrow('Missing FINNHUB_KEY');
  });
});
