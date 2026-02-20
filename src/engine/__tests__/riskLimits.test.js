import { describe, expect, it } from 'vitest';
import {
  computeDynamicLimits,
  computeExposureByClass,
  computeExposureByRegion,
  computeExposureByTicker,
  inferRegimeContext,
  inferRegion
} from '../riskLimits';

describe('riskLimits engine', () => {
  it('infers Risk On regime with contained volatility', () => {
    const assets = [
      { symbol: 'A', changePercent: 0.9 },
      { symbol: 'B', changePercent: 0.7 },
      { symbol: 'C', changePercent: 0.4 },
      { symbol: 'D', changePercent: -0.1 },
      { symbol: 'E', changePercent: 0.5 }
    ];

    const out = inferRegimeContext(assets);
    expect(out.regime).toBe('Risk On');
    expect(out.volatility).toBe('Contained');
  });

  it('infers Risk Off regime with high volatility', () => {
    const assets = [
      { symbol: 'A', changePercent: -4.4 },
      { symbol: 'B', changePercent: -2.8 },
      { symbol: 'C', changePercent: -2.3 },
      { symbol: 'D', changePercent: -1.9 },
      { symbol: 'E', changePercent: 0.1 }
    ];

    const out = inferRegimeContext(assets);
    expect(out.regime).toBe('Risk Off');
    expect(out.volatility).toBe('High');
  });

  it('aggregates exposure by class', () => {
    const positions = [
      { category: 'equity', marketValue: 70 },
      { category: 'crypto', marketValue: 20 },
      { category: 'equity', marketValue: 10 }
    ];

    const out = computeExposureByClass(positions);
    expect(out).toHaveLength(2);
    expect(out[0].assetClass).toBe('equity');
    expect(out[0].pct).toBeCloseTo(80, 5);
    expect(out[1].assetClass).toBe('crypto');
    expect(out[1].pct).toBeCloseTo(20, 5);
  });

  it('aggregates exposure by ticker', () => {
    const positions = [
      { symbol: 'AAPL', marketValue: 60 },
      { symbol: 'NVDA', marketValue: 30 },
      { symbol: 'AAPL', marketValue: 10 }
    ];
    const out = computeExposureByTicker(positions);
    expect(out[0].ticker).toBe('AAPL');
    expect(out[0].pct).toBeCloseTo(70, 5);
    expect(out[1].ticker).toBe('NVDA');
  });

  it('aggregates exposure by inferred region', () => {
    const positions = [
      { symbol: 'AAPL', category: 'equity', marketValue: 50 },
      { symbol: 'MELI', category: 'equity', marketValue: 30 },
      { symbol: 'EUR_USD', category: 'fx', marketValue: 20 }
    ];
    const out = computeExposureByRegion(positions);
    const us = out.find((row) => row.region === 'US');
    const latam = out.find((row) => row.region === 'LATAM');
    const global = out.find((row) => row.region === 'GLOBAL');
    expect(us.pct).toBeCloseTo(50, 5);
    expect(latam.pct).toBeCloseTo(30, 5);
    expect(global.pct).toBeCloseTo(20, 5);
  });

  it('infers region by symbol and category', () => {
    expect(inferRegion({ symbol: 'AAPL', category: 'equity' })).toBe('US');
    expect(inferRegion({ symbol: 'MELI', category: 'equity' })).toBe('LATAM');
    expect(inferRegion({ symbol: 'EUR_USD', category: 'fx' })).toBe('GLOBAL');
  });

  it('applies elevated volatility limit adjustments with explanation', () => {
    const out = computeDynamicLimits({
      exposureByClass: [{ assetClass: 'equity', pct: 52.5 }],
      exposureByTicker: [{ ticker: 'AAPL', pct: 20 }],
      exposureByRegion: [{ region: 'US', pct: 80 }],
      baseLimits: { equity: 70, crypto: 25 },
      regionBaseLimits: { US: 65 },
      volatility: 'Elevated',
      crisisActive: false
    });

    const equity = out.classLimits.rows.find((row) => row.assetClass === 'equity');
    const crypto = out.classLimits.rows.find((row) => row.assetClass === 'crypto');
    expect(equity.adjusted).toBe(62);
    expect(crypto.adjusted).toBe(22);
    expect(out.tickerLimits.rows[0].adjusted).toBe(16);
    expect(out.regionLimits.rows[0].adjusted).toBe(57);
    expect(out.explanations.join(' ')).toContain('rising volatility regime');
  });

  it('applies crisis mode adjustments with crisis explanation', () => {
    const out = computeDynamicLimits({
      exposureByClass: [{ assetClass: 'equity', pct: 48.1 }],
      exposureByTicker: [{ ticker: 'AAPL', pct: 24.1 }],
      exposureByRegion: [{ region: 'US', pct: 80 }],
      baseLimits: { equity: 70 },
      regionBaseLimits: { US: 65 },
      volatility: 'Contained',
      crisisActive: true
    });

    expect(out.classLimits.rows[0].adjusted).toBe(55);
    expect(out.explanations[0]).toContain('crisis mode');
    expect(out.explanations.join(' ')).toContain('concentration risk');
  });
});
