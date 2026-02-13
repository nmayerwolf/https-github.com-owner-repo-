import { describe, expect, it } from 'vitest';
import { calculateIndicators } from '../analysis';

const makeSeries = (n, base = 100, step = 1) => Array.from({ length: n }, (_, i) => base + i * step);

describe('calculateIndicators', () => {
  it('returns null for insufficient candles', () => {
    const closes = makeSeries(20);
    const out = calculateIndicators({ closes, highs: closes, lows: closes, volumes: makeSeries(20, 10, 0) });
    expect(out).toBeNull();
  });

  it('computes expected indicator fields for valid input', () => {
    const closes = makeSeries(220, 100, 0.5);
    const highs = closes.map((x) => x + 1);
    const lows = closes.map((x) => x - 1);
    const volumes = makeSeries(220, 1000, 2);

    const out = calculateIndicators({ closes, highs, lows, volumes });

    expect(out).not.toBeNull();
    expect(out.currentPrice).toBe(closes[closes.length - 1]);
    expect(out.rsi).toBeGreaterThan(50);
    expect(out.macd).toBeTruthy();
    expect(out.bollinger.upper).toBeGreaterThan(out.bollinger.middle);
    expect(out.bollinger.lower).toBeLessThan(out.bollinger.middle);
    expect(out.sma50).toBeGreaterThan(0);
    expect(out.sma200).toBeGreaterThan(0);
    expect(out.atr).toBeGreaterThan(0);
    expect(out.volumeRatio).toBeGreaterThan(0);
  });
});
