const {
  createAlertEngine,
  mapRecommendationToType,
  computeAdaptiveStops,
  mergeConfig
} = require('../src/services/alertEngine');

describe('alertEngine helpers', () => {
  test('mapRecommendationToType maps buy/sell/hold', () => {
    expect(mapRecommendationToType('BUY')).toBe('opportunity');
    expect(mapRecommendationToType('STRONG BUY')).toBe('opportunity');
    expect(mapRecommendationToType('SELL')).toBe('bearish');
    expect(mapRecommendationToType('STRONG SELL')).toBe('bearish');
    expect(mapRecommendationToType('HOLD')).toBeNull();
  });

  test('computeAdaptiveStops adjusts multiplier by RSI', () => {
    const neutral = computeAdaptiveStops(100, 4, 50);
    const overbought = computeAdaptiveStops(100, 4, 70);
    const oversold = computeAdaptiveStops(100, 4, 30);

    expect(neutral.stopLoss).toBeCloseTo(91.2, 5);
    expect(overbought.stopLoss).toBeCloseTo(92, 5);
    expect(oversold.stopLoss).toBeCloseTo(90, 5);
  });

  test('mergeConfig returns defaults when missing', () => {
    const merged = mergeConfig({});

    expect(merged.rsiOS).toBe(30);
    expect(merged.rsiOB).toBe(70);
    expect(merged.minConfluence).toBe(2);
  });
});

describe('alertEngine cycle', () => {
  test('creates opportunity alert from watchlist symbol', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ sectors: [], rsi_os: 35, rsi_ob: 65, vol_thresh: 2, min_confluence: 1 }] })
      .mockResolvedValueOnce({ rows: [{ symbol: 'AAPL', name: 'Apple', category: 'equity' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1', symbol: 'AAPL', type: 'opportunity', recommendation: 'BUY', confidence: 'medium' }] });

    const wsHub = { broadcastAlert: jest.fn() };
    const finnhub = { quote: jest.fn(), candles: jest.fn() };

    const engine = createAlertEngine({ query, finnhub, wsHub, logger: { warn: jest.fn(), error: jest.fn() } });

    const prices = Array.from({ length: 80 }, (_, i) => 100 - i * 0.5);
    const highs = prices.map((p) => p + 1);
    const lows = prices.map((p) => p - 1);
    const vols = Array.from({ length: 80 }, (_, i) => (i === 79 ? 8000 : 2000));

    const result = await engine.runUserCycle('u1', {
      assetSnapshotsOverride: {
        AAPL: engine.buildAssetFromMarketData(
          'AAPL',
          { c: prices[prices.length - 1], pc: prices[prices.length - 2] },
          { s: 'ok', c: prices, h: highs, l: lows, v: vols }
        )
      }
    });

    expect(result.alertsCreated).toBe(1);
    expect(wsHub.broadcastAlert).toHaveBeenCalledTimes(1);
  });

  test('creates stop-loss alert for active position under stop', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ sectors: [], rsi_os: 30, rsi_ob: 70, vol_thresh: 2, min_confluence: 5 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'p1', symbol: 'AAPL', name: 'Apple', buy_price: 200, quantity: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'sl1', symbol: 'AAPL', type: 'stop_loss', recommendation: 'STOP LOSS', confidence: 'high' }] });

    const wsHub = { broadcastAlert: jest.fn() };
    const finnhub = { quote: jest.fn(), candles: jest.fn() };

    const engine = createAlertEngine({ query, finnhub, wsHub, logger: { warn: jest.fn(), error: jest.fn() } });

    const base = Array.from({ length: 80 }, (_, i) => 220 - i * 0.8);
    const prices = [...base.slice(0, -1), 170];

    const snapshot = engine.buildAssetFromMarketData(
      'AAPL',
      { c: 170, pc: 171 },
      {
        s: 'ok',
        c: prices,
        h: prices.map((p) => p + 1),
        l: prices.map((p) => p - 1),
        v: Array.from({ length: 80 }, () => 2500)
      }
    );

    const result = await engine.runUserCycle('u1', {
      assetSnapshotsOverride: { AAPL: snapshot }
    });

    expect(result.alertsCreated).toBe(1);
    expect(wsHub.broadcastAlert).toHaveBeenCalledTimes(1);
  });
});
