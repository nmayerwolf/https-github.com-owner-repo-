jest.mock('../src/services/finnhub', () => ({
  candles: jest.fn(),
  cryptoCandles: jest.fn(),
  forexCandles: jest.fn(),
  quote: jest.fn(),
  symbolSearch: jest.fn()
}));

const finnhub = require('../src/services/finnhub');
const { resolveMarketCandles } = require('../src/services/marketDataProvider');

describe('marketDataProvider service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('fetches daily bars for SPY', async () => {
    finnhub.candles.mockResolvedValueOnce({
      s: 'ok',
      c: [500.1, 501.2, 502.4],
      h: [501.0, 502.1, 503.0],
      l: [499.5, 500.2, 501.1],
      v: [100, 120, 150],
      t: [1700000000, 1700086400, 1700172800]
    });

    const out = await resolveMarketCandles({
      symbol: 'SPY',
      resolution: 'D',
      from: 1700000000,
      to: 1700172800
    });

    expect(finnhub.candles).toHaveBeenCalledWith('SPY', 'D', 1700000000, 1700172800);
    expect(Array.isArray(out.c)).toBe(true);
    expect(out.c.length).toBeGreaterThan(0);
    expect(out.c[0]).toBeGreaterThan(0);
  });
});
