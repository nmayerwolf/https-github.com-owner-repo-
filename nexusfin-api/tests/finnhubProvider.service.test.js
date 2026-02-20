jest.mock('../src/services/finnhub', () => ({
  candles: jest.fn(),
  profile: jest.fn(),
  companyNews: jest.fn(),
  generalNews: jest.fn()
}));

const finnhub = require('../src/services/finnhub');
const { FinnhubProvider } = require('../src/providers/FinnhubProvider');

describe('FinnhubProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('getDailyBars returns normalized OHLCV rows', async () => {
    finnhub.candles.mockResolvedValueOnce({
      o: [100, 101],
      h: [102, 103],
      l: [99, 100],
      c: [101, 102],
      v: [1000, 1100],
      t: [1700000000, 1700086400]
    });

    const provider = new FinnhubProvider(finnhub);
    const rows = await provider.getDailyBars(['SPY'], 1700000000, 1700086400);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      symbol: 'SPY',
      open: 100,
      high: 102,
      low: 99,
      close: 101
    });
  });

  test('getFundamentals returns rows for symbols with profile', async () => {
    finnhub.profile.mockResolvedValueOnce({ ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust' });
    const provider = new FinnhubProvider(finnhub);
    const rows = await provider.getFundamentals(['SPY']);
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe('SPY');
    expect(rows[0].raw.ticker).toBe('SPY');
  });

  test('getNews falls back to general feed when no company feed', async () => {
    finnhub.companyNews.mockResolvedValueOnce([]);
    finnhub.generalNews.mockResolvedValue([{ id: 1, datetime: 1700000000, headline: 'Macro update', summary: 'test', url: 'https://example.com/news' }]);

    const provider = new FinnhubProvider(finnhub);
    const rows = await provider.getNews('2026-02-18', '2026-02-19', ['SPY']);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].headline).toBe('Macro update');
  });
});
