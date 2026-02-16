const {
  createAlertEngine,
  mapRecommendationToType,
  computeAdaptiveStops,
  mergeConfig,
  evaluateOutcome,
  resolveRealtimeQuoteSymbol
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

  test('resolveRealtimeQuoteSymbol infers provider symbol', () => {
    expect(resolveRealtimeQuoteSymbol('AAPL')).toEqual({ quoteSymbol: 'AAPL', market: 'equity' });
    expect(resolveRealtimeQuoteSymbol('BTCUSDT')).toEqual({ quoteSymbol: 'BINANCE:BTCUSDT', market: 'crypto' });
    expect(resolveRealtimeQuoteSymbol('EUR_USD')).toEqual({ quoteSymbol: 'OANDA:EUR_USD', market: 'fx' });
  });

  test('evaluateOutcome evaluates opportunity and bearish thresholds', () => {
    expect(evaluateOutcome({ type: 'opportunity', priceAtAlert: 100, currentPrice: 106 })).toEqual({ outcome: 'win', shouldUpdate: true });
    expect(evaluateOutcome({ type: 'opportunity', priceAtAlert: 100, currentPrice: 94 })).toEqual({ outcome: 'loss', shouldUpdate: true });
    expect(evaluateOutcome({ type: 'opportunity', priceAtAlert: 100, takeProfit: 110, currentPrice: 111 })).toEqual({
      outcome: 'win',
      shouldUpdate: true
    });
    expect(evaluateOutcome({ type: 'opportunity', priceAtAlert: 100, stopLoss: 95, currentPrice: 94.5 })).toEqual({
      outcome: 'loss',
      shouldUpdate: true
    });
    expect(evaluateOutcome({ type: 'opportunity', priceAtAlert: 100, currentPrice: 101 })).toEqual({ outcome: 'open', shouldUpdate: false });

    expect(evaluateOutcome({ type: 'bearish', priceAtAlert: 100, currentPrice: 94 })).toEqual({ outcome: 'win', shouldUpdate: true });
    expect(evaluateOutcome({ type: 'bearish', priceAtAlert: 100, currentPrice: 106 })).toEqual({ outcome: 'loss', shouldUpdate: true });
  });
});

describe('alertEngine cycle', () => {
  test('creates opportunity alert from watchlist symbol', async () => {
    const query = jest.fn(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM user_configs')) return { rows: [{ sectors: [], rsi_os: 35, rsi_ob: 65, vol_thresh: 2, min_confluence: 1 }] };
      if (text.includes('FROM watchlist_items')) return { rows: [{ symbol: 'AAPL', name: 'Apple', category: 'equity' }] };
      if (text.includes('FROM positions')) return { rows: [] };
      if (text.includes('INSERT INTO alerts'))
        return { rows: [{ id: 'a1', symbol: 'AAPL', type: 'opportunity', recommendation: 'BUY', confidence: 'medium' }] };
      return { rows: [] };
    });

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
    const query = jest.fn(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM user_configs')) return { rows: [{ sectors: [], rsi_os: 30, rsi_ob: 70, vol_thresh: 2, min_confluence: 5 }] };
      if (text.includes('FROM watchlist_items')) return { rows: [] };
      if (text.includes('FROM positions')) return { rows: [{ id: 'p1', symbol: 'AAPL', name: 'Apple', buy_price: 200, quantity: 1 }] };
      if (text.includes('INSERT INTO alerts'))
        return { rows: [{ id: 'sl1', symbol: 'AAPL', type: 'stop_loss', recommendation: 'STOP LOSS', confidence: 'high' }] };
      return { rows: [] };
    });

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

  test('uses crypto endpoints for crypto watchlist symbols', async () => {
    const query = jest.fn(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM user_configs')) return { rows: [{ sectors: [], rsi_os: 35, rsi_ob: 65, vol_thresh: 2, min_confluence: 1 }] };
      if (text.includes('FROM watchlist_items')) return { rows: [{ symbol: 'BTCUSDT', name: 'Bitcoin', category: 'crypto' }] };
      if (text.includes('FROM positions')) return { rows: [] };
      if (text.includes('INSERT INTO alerts'))
        return { rows: [{ id: 'c1', symbol: 'BTCUSDT', type: 'opportunity', recommendation: 'BUY', confidence: 'high' }] };
      return { rows: [] };
    });

    const prices = Array.from({ length: 90 }, (_, i) => 100 - i * 0.4);
    const finnhub = {
      quote: jest.fn().mockResolvedValue({ c: prices[prices.length - 1], pc: prices[prices.length - 2] }),
      candles: jest.fn(),
      cryptoCandles: jest.fn().mockResolvedValue({
        s: 'ok',
        c: prices,
        h: prices.map((p) => p + 2),
        l: prices.map((p) => p - 2),
        v: prices.map((_, i) => (i === prices.length - 1 ? 9000 : 3000))
      }),
      forexCandles: jest.fn()
    };

    const wsHub = { broadcastAlert: jest.fn() };
    const engine = createAlertEngine({ query, finnhub, wsHub, logger: { warn: jest.fn(), error: jest.fn() } });

    const result = await engine.runUserCycle('u1');

    expect(result.alertsCreated).toBe(1);
    expect(finnhub.quote).toHaveBeenCalledWith('BINANCE:BTCUSDT');
    expect(finnhub.cryptoCandles).not.toHaveBeenCalled();
    expect(finnhub.candles).not.toHaveBeenCalled();
  });

  test('runOutcomeEvaluationCycle updates win/loss alerts from live price', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { id: 'a1', symbol: 'AAPL', type: 'opportunity', price_at_alert: 100, stop_loss: 95, take_profit: 112 },
          { id: 'a2', symbol: 'NVDA', type: 'bearish', price_at_alert: 100, stop_loss: 107, take_profit: 90 },
          { id: 'a3', symbol: 'MSFT', type: 'opportunity', price_at_alert: 100, stop_loss: 95, take_profit: 110 }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const finnhub = {
      quote: jest
        .fn()
        .mockResolvedValueOnce({ c: 113 }) // a1 -> win by TP
        .mockResolvedValueOnce({ c: 108 }) // a2 -> loss by SL
        .mockResolvedValueOnce({ c: 101 }), // a3 -> open
      candles: jest.fn(),
      cryptoCandles: jest.fn(),
      forexCandles: jest.fn()
    };

    const engine = createAlertEngine({ query, finnhub, wsHub: { broadcastAlert: jest.fn() }, logger: { warn: jest.fn(), error: jest.fn() } });

    const out = await engine.runOutcomeEvaluationCycle();

    expect(out.scanned).toBe(3);
    expect(out.updated).toBe(2);
    expect(out.wins).toBe(1);
    expect(out.losses).toBe(1);
    expect(out.open).toBe(1);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE alerts'),
      ['a1', 'win', 113]
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE alerts'),
      ['a2', 'loss', 108]
    );
  });
});
