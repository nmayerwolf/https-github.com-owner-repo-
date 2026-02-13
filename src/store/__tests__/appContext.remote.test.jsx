/* @vitest-environment jsdom */
import React, { useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useAuthMock, apiMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  apiMock: {
    getPortfolio: vi.fn(),
    getConfig: vi.fn(),
    getWatchlist: vi.fn(),
    quote: vi.fn(),
    candles: vi.fn(),
    cryptoCandles: vi.fn(),
    forexCandles: vi.fn(),
    updateConfig: vi.fn(),
    addPosition: vi.fn(),
    updatePosition: vi.fn(),
    deletePosition: vi.fn(),
    addToWatchlist: vi.fn(),
    removeFromWatchlist: vi.fn()
  }
}));

const makeCandles = (base = 100) => {
  const c = Array.from({ length: 90 }, (_, i) => base + i * 0.2);
  return {
    c,
    h: c.map((x) => x + 1),
    l: c.map((x) => x - 1),
    v: c.map((_, i) => 1000 + i)
  };
};

vi.mock('../AuthContext', () => ({
  useAuth: () => useAuthMock()
}));

vi.mock('../../api/apiClient', () => ({
  api: apiMock
}));

vi.mock('../../api/finnhub', () => ({
  fetchAssetSnapshot: vi.fn(),
  createFinnhubSocket: vi.fn(() => ({ close: () => {} })),
  getFinnhubHealth: () => ({ calls: 0, errors: 0, rateLimited: 0, retries: 0, lastError: '', lastCallAt: 0 })
}));

vi.mock('../../api/alphavantage', () => ({
  fetchMacroAssets: vi.fn(async () => []),
  getAlphaHealth: () => ({ calls: 0, errors: 0, rateLimited: 0, cacheHits: 0, lastError: '', lastCallAt: 0 })
}));

vi.mock('../../api/claude', () => ({
  getClaudeHealth: () => ({ calls: 0, errors: 0, fallbacks: 0, lastError: '', lastCallAt: 0 })
}));

import { AppProvider, useApp } from '../AppContext';

const Probe = ({ onState }) => {
  const ctx = useApp();

  useEffect(() => {
    onState(ctx);
  }, [ctx, onState]);

  return null;
};

const renderWithProbe = () => {
  let latest;
  render(
    <AppProvider>
      <Probe onState={(ctx) => (latest = ctx)} />
    </AppProvider>
  );
  return () => latest;
};

describe('AppContext remote integration', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('nexusfin_watchlist', JSON.stringify(['AAPL']));

    useAuthMock.mockReturnValue({ isAuthenticated: true });

    apiMock.getPortfolio.mockReset();
    apiMock.getConfig.mockReset();
    apiMock.getWatchlist.mockReset();
    apiMock.quote.mockReset();
    apiMock.candles.mockReset();

    apiMock.getPortfolio.mockResolvedValue({
      positions: [
        {
          id: 'p1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          category: 'equity',
          buy_date: '2025-06-15',
          buy_price: 195.5,
          quantity: 10
        }
      ]
    });
    apiMock.getConfig.mockResolvedValue({ riskProfile: 'moderado', minConfluence: 2 });
    apiMock.getWatchlist.mockResolvedValue({ symbols: [{ symbol: 'AAPL' }] });
    apiMock.quote.mockResolvedValue({ c: 120, pc: 100, dp: 20 });
    apiMock.candles.mockResolvedValue(makeCandles(100));
  });

  it('syncs remote user data and supports explicit remote refresh', async () => {
    const getLatest = renderWithProbe();

    await waitFor(() => {
      expect(getLatest()).toBeTruthy();
      expect(getLatest().state.loading).toBe(false);
    });

    expect(getLatest().state.sourceMode).toBe('remote');
    expect(getLatest().state.positions.length).toBe(1);
    expect(getLatest().state.watchlistSymbols).toEqual(['AAPL']);
    expect(apiMock.getPortfolio).toHaveBeenCalledTimes(1);

    await getLatest().actions.refreshRemoteUserData();

    await waitFor(() => {
      expect(apiMock.getPortfolio).toHaveBeenCalledTimes(2);
    });
  });
});
