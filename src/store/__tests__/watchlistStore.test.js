/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { loadWatchlistSymbols, saveWatchlistSymbols } from '../watchlistStore';

describe('watchlistStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns defaults when no watchlist is stored', () => {
    const out = loadWatchlistSymbols();
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it('keeps explicit empty watchlist without restoring defaults', () => {
    saveWatchlistSymbols([]);
    const out = loadWatchlistSymbols();
    expect(out).toEqual([]);
  });
});

