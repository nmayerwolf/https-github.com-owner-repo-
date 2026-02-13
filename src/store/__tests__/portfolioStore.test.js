/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPortfolio, savePortfolio } from '../portfolioStore';

describe('portfolioStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads empty list when storage has no data', () => {
    expect(loadPortfolio()).toEqual([]);
  });

  it('saves and reloads portfolio entries', () => {
    const rows = [{ id: '1', symbol: 'AAPL', buyPrice: 100, quantity: 2 }];
    savePortfolio(rows);
    expect(loadPortfolio()).toEqual(rows);
  });

  it('returns empty list on malformed json', () => {
    localStorage.setItem('nexusfin_portfolio', '{bad-json');
    expect(loadPortfolio()).toEqual([]);
  });

  it('throws when save fails (current behavior)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => savePortfolio([{ id: 'x' }])).toThrow();
  });
});
