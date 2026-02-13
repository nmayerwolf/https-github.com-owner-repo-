import { DEFAULT_WATCHLIST } from '../utils/constants';

const KEY = 'nexusfin_watchlist';

export const loadWatchlistSymbols = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length) return arr;
  } catch {
    // Ignore parse errors.
  }
  return DEFAULT_WATCHLIST.map((x) => x.symbol);
};

export const saveWatchlistSymbols = (symbols) => {
  localStorage.setItem(KEY, JSON.stringify(symbols));
};
