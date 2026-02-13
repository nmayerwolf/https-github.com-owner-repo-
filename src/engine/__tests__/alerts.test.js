import { describe, expect, it } from 'vitest';
import { buildAlerts, stopLossAlerts } from '../alerts';

const config = { rsiOS: 30, rsiOB: 70, volThresh: 2, minConfluence: 2 };

describe('alerts engine', () => {
  it('builds buy/sell alerts from confluence', () => {
    const assets = [
      {
        symbol: 'AAA',
        price: 100,
        changePercent: 2,
        indicators: {
          rsi: 25,
          macd: { line: 1, signal: 0.2, histogram: 0.4 },
          bollinger: { lower: 100, upper: 120 },
          sma50: 105,
          sma200: 95,
          currentPrice: 100,
          volumeRatio: 3,
          atr: 2
        }
      },
      {
        symbol: 'BBB',
        price: 100,
        changePercent: -2,
        indicators: {
          rsi: 80,
          macd: { line: -1, signal: -0.2, histogram: -0.3 },
          bollinger: { lower: 80, upper: 100 },
          sma50: 90,
          sma200: 100,
          currentPrice: 101,
          volumeRatio: 3,
          atr: 2
        }
      }
    ];

    const out = buildAlerts(assets, config);
    expect(out.some((a) => a.type === 'compra' && a.symbol === 'AAA')).toBe(true);
    expect(out.some((a) => a.type === 'venta' && a.symbol === 'BBB')).toBe(true);
  });

  it('triggers stop-loss alert when price drops below buy-based stop', () => {
    const positions = [{ id: '1', symbol: 'AAA', buyPrice: 100, quantity: 1 }];
    const bySymbol = {
      AAA: {
        price: 94,
        indicators: { atr: 2, rsi: 50 }
      }
    };

    const out = stopLossAlerts(positions, bySymbol);
    expect(out.length).toBe(1);
    expect(out[0].type).toBe('stoploss');
    expect(out[0].symbol).toBe('AAA');
  });
});
