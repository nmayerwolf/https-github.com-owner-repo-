import { describe, expect, it } from 'vitest';
import { calculateConfluence } from '../confluence';

const config = { rsiOS: 30, rsiOB: 70, volThresh: 2, minConfluence: 2 };

describe('calculateConfluence', () => {
  it('returns strong buy for aligned bullish signals', () => {
    const asset = {
      changePercent: 2,
      indicators: {
        rsi: 25,
        macd: { line: 1, signal: 0.4, histogram: 0.6 },
        bollinger: { lower: 95, upper: 110 },
        sma50: 101,
        sma200: 95,
        currentPrice: 95,
        volumeRatio: 2.5
      }
    };

    const out = calculateConfluence(asset, config);
    expect(out.recommendation).toBe('STRONG BUY');
    expect(out.net).toBeGreaterThanOrEqual(4);
  });

  it('returns strong sell for aligned bearish signals', () => {
    const asset = {
      changePercent: -2,
      indicators: {
        rsi: 80,
        macd: { line: -1, signal: -0.2, histogram: -0.4 },
        bollinger: { lower: 90, upper: 100 },
        sma50: 95,
        sma200: 100,
        currentPrice: 101,
        volumeRatio: 2.3
      }
    };

    const out = calculateConfluence(asset, config);
    expect(out.recommendation).toBe('STRONG SELL');
    expect(out.net).toBeLessThanOrEqual(-4);
  });
});
