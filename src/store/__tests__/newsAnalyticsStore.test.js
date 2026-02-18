/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getNewsCtrSummary,
  recordRecommendedClick,
  recordRecommendedImpressions,
  resetNewsCtrStats
} from '../newsAnalyticsStore';

describe('newsAnalyticsStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetNewsCtrStats();
  });

  it('tracks impressions and clicks for recommended news', () => {
    recordRecommendedImpressions([
      { id: 'n1', aiTheme: 'macro', aiScore: 18, headline: 'Fed update' },
      { id: 'n2', aiTheme: 'crypto', aiScore: 12, headline: 'BTC regulation' }
    ]);
    recordRecommendedClick({ id: 'n1', aiTheme: 'macro', aiScore: 18, headline: 'Fed update' });

    const out = getNewsCtrSummary({ days: 7 });
    expect(out.impressions).toBe(2);
    expect(out.clicks).toBe(1);
    expect(out.ctr).toBeCloseTo(50, 5);
    expect(out.byTheme.some((x) => x.theme === 'macro')).toBe(true);
  });

  it('resets metrics', () => {
    recordRecommendedImpressions([{ id: 'n1', aiTheme: 'macro', aiScore: 18 }]);
    recordRecommendedClick({ id: 'n1', aiTheme: 'macro', aiScore: 18 });
    resetNewsCtrStats();
    const out = getNewsCtrSummary({ days: 7 });
    expect(out.impressions).toBe(0);
    expect(out.clicks).toBe(0);
    expect(out.byTheme).toEqual([]);
  });
});

