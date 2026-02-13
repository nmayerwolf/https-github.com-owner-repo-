/* @vitest-environment jsdom */
import React, { useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '../AppContext';

const makeCandles = (base = 100) => {
  const c = Array.from({ length: 90 }, (_, i) => base + i * 0.2);
  return {
    c,
    h: c.map((x) => x + 1),
    l: c.map((x) => x - 1),
    v: c.map((_, i) => 1000 + i)
  };
};

const fetchAssetSnapshotMock = vi.fn();
const fetchMacroAssetsMock = vi.fn();
const createFinnhubSocketMock = vi.fn();

vi.mock('../../api/finnhub', () => ({
  fetchAssetSnapshot: (...args) => fetchAssetSnapshotMock(...args),
  createFinnhubSocket: (...args) => createFinnhubSocketMock(...args),
  getFinnhubHealth: () => ({ calls: 0, errors: 0, rateLimited: 0, retries: 0, lastError: '', lastCallAt: 0 })
}));

vi.mock('../../api/alphavantage', () => ({
  fetchMacroAssets: (...args) => fetchMacroAssetsMock(...args),
  getAlphaHealth: () => ({ calls: 0, errors: 0, rateLimited: 0, cacheHits: 0, lastError: '', lastCallAt: 0 })
}));

vi.mock('../../api/claude', () => ({
  getClaudeHealth: () => ({ calls: 0, errors: 0, fallbacks: 0, lastError: '', lastCallAt: 0 })
}));

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

describe('AppContext integration', () => {
  beforeEach(() => {
    localStorage.clear();

    fetchAssetSnapshotMock.mockReset();
    fetchAssetSnapshotMock.mockImplementation(async (meta) => ({
      quote: { c: 120, pc: 100, dp: 20 },
      candles: makeCandles(meta.symbol === 'NFLX' ? 120 : 100)
    }));

    fetchMacroAssetsMock.mockReset();
    fetchMacroAssetsMock.mockResolvedValue([]);

    createFinnhubSocketMock.mockReset();
    createFinnhubSocketMock.mockImplementation(() => ({ close: () => {} }));
  });

  it('adds and removes watchlist assets via context actions', async () => {
    const getLatest = renderWithProbe();

    await waitFor(() => {
      expect(getLatest()).toBeTruthy();
      expect(getLatest().state.loading).toBe(false);
    });

    await getLatest().actions.addToWatchlist('NFLX');

    await waitFor(() => {
      expect(getLatest().state.watchlistSymbols.includes('NFLX')).toBe(true);
      expect(getLatest().state.assets.some((a) => a.symbol === 'NFLX')).toBe(true);
    });

    const storedAfterAdd = JSON.parse(localStorage.getItem('nexusfin_watchlist'));
    expect(storedAfterAdd).toEqual(expect.arrayContaining(['NFLX']));

    getLatest().actions.removeFromWatchlist('NFLX');

    await waitFor(() => {
      expect(getLatest().state.watchlistSymbols.includes('NFLX')).toBe(false);
      expect(getLatest().state.assets.some((a) => a.symbol === 'NFLX')).toBe(false);
    });
  });

  it('sets macroStatus=error and pushes UI error when macro load fails', async () => {
    fetchMacroAssetsMock.mockRejectedValueOnce(new Error('macro failed'));

    const getLatest = renderWithProbe();

    await waitFor(() => {
      expect(getLatest()).toBeTruthy();
      expect(getLatest().state.loading).toBe(false);
    });

    await waitFor(() => {
      expect(getLatest().state.macroStatus).toBe('error');
      expect(getLatest().state.uiErrors.some((e) => e.module === 'Macro')).toBe(true);
    });
  });

  it('pushes watchlist UI error when addToWatchlist cannot fetch data', async () => {
    const getLatest = renderWithProbe();

    await waitFor(() => {
      expect(getLatest()).toBeTruthy();
      expect(getLatest().state.loading).toBe(false);
    });

    fetchAssetSnapshotMock.mockImplementation(async (meta) => {
      if (meta.symbol === 'BABA') return null;
      return {
        quote: { c: 120, pc: 100, dp: 20 },
        candles: makeCandles(100)
      };
    });

    await getLatest().actions.addToWatchlist('BABA');

    await waitFor(() => {
      expect(getLatest().state.uiErrors.some((e) => e.module === 'Watchlist')).toBe(true);
    });
  });

  it('pushes mercado UI error when initial asset load fails for one symbol', async () => {
    fetchAssetSnapshotMock.mockImplementation(async (meta) => {
      if (meta.symbol === 'AAPL') return null;
      return {
        quote: { c: 120, pc: 100, dp: 20 },
        candles: makeCandles(100)
      };
    });

    const getLatest = renderWithProbe();

    await waitFor(() => {
      expect(getLatest()).toBeTruthy();
      expect(getLatest().state.loading).toBe(false);
    });

    expect(getLatest().state.uiErrors.some((e) => e.module === 'Mercados')).toBe(true);
  });

  it('captures websocket error status into uiErrors', async () => {
    createFinnhubSocketMock.mockImplementationOnce(({ onStatus }) => {
      onStatus?.('error');
      return { close: () => {} };
    });

    const getLatest = renderWithProbe();

    await waitFor(() => {
      expect(getLatest()).toBeTruthy();
      expect(getLatest().state.loading).toBe(false);
    });

    await waitFor(() => {
      expect(getLatest().state.wsStatus).toBe('error');
      expect(getLatest().state.uiErrors.some((e) => e.module === 'WebSocket')).toBe(true);
    });
  });
});
