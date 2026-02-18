/* @vitest-environment jsdom */
import React, { useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '../AppContext';

const makeCandles = (base = 100) => {
  const c = Array.from({ length: 90 }, (_, i) => base + i * 0.15);
  return {
    c,
    h: c.map((x) => x + 1),
    l: c.map((x) => x - 1),
    v: c.map((_, i) => 1000 + i)
  };
};

const { apiMock, createBackendSocketMock, fetchMacroAssetsMock } = vi.hoisted(() => ({
  apiMock: {
    getPortfolio: vi.fn(),
    getConfig: vi.fn(),
    getWatchlist: vi.fn(),
    snapshot: vi.fn(),
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
  },
  createBackendSocketMock: vi.fn(),
  fetchMacroAssetsMock: vi.fn()
}));

vi.mock('../../api/apiClient', () => ({
  api: apiMock
}));

vi.mock('../../store/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true })
}));

vi.mock('../../api/realtime', () => ({
  createBackendSocket: (...args) => createBackendSocketMock(...args)
}));

vi.mock('../../api/finnhub', () => ({
  fetchAssetSnapshot: vi.fn(),
  createFinnhubSocket: vi.fn(() => ({ close: () => {} })),
  recordFinnhubProxyStats: vi.fn(),
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

describe('AppContext authenticated integration', () => {
  beforeEach(() => {
    localStorage.clear();

    apiMock.getPortfolio.mockReset();
    apiMock.getConfig.mockReset();
    apiMock.getWatchlist.mockReset();
    apiMock.quote.mockReset();
    apiMock.snapshot.mockReset();
    apiMock.candles.mockReset();
    apiMock.cryptoCandles.mockReset();
    apiMock.forexCandles.mockReset();
    apiMock.updateConfig.mockReset();
    apiMock.addPosition.mockReset();
    apiMock.updatePosition.mockReset();
    apiMock.deletePosition.mockReset();
    apiMock.addToWatchlist.mockReset();
    apiMock.removeFromWatchlist.mockReset();
    createBackendSocketMock.mockReset();
    fetchMacroAssetsMock.mockReset();

    apiMock.getPortfolio.mockResolvedValue({
      portfolios: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Tech', is_default: false }],
      positions: []
    });
    apiMock.getConfig.mockResolvedValue({ riskProfile: 'moderado', horizon: 'mediano', rsiOS: 30, rsiOB: 70, volThresh: 2, minConfluence: 2 });
    apiMock.getWatchlist.mockResolvedValue({
      symbols: [
        { symbol: 'AAPL' },
        { symbol: 'NVDA' }
      ]
    });

    apiMock.quote.mockResolvedValue({ c: 120, pc: 100, dp: 20 });
    apiMock.candles.mockResolvedValue(makeCandles(100));
    apiMock.cryptoCandles.mockResolvedValue(makeCandles(200));
    apiMock.forexCandles.mockResolvedValue(makeCandles(50));
    apiMock.snapshot.mockResolvedValue({
      items: [
        { symbol: 'AAPL', quote: { c: 120, pc: 100, dp: 20 }, candles: makeCandles(100) },
        { symbol: 'NVDA', quote: { c: 220, pc: 200, dp: 10 }, candles: makeCandles(200) }
      ],
      errors: []
    });

    apiMock.updateConfig.mockResolvedValue({ riskProfile: 'agresivo', horizon: 'corto', rsiOS: 25, rsiOB: 75, volThresh: 1.8, minConfluence: 3 });
    apiMock.addPosition.mockResolvedValue({
      id: 'p1',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      symbol: 'AAPL',
      name: 'Apple',
      category: 'equity',
      buy_date: '2026-02-10',
      buy_price: 100,
      quantity: 1,
      sell_date: null,
      sell_price: null,
      notes: ''
    });
    apiMock.updatePosition.mockResolvedValue({
      id: 'p1',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      symbol: 'AAPL',
      name: 'Apple',
      category: 'equity',
      buy_date: '2026-02-10',
      buy_price: 100,
      quantity: 1,
      sell_date: '2026-02-15',
      sell_price: 125,
      notes: ''
    });
    apiMock.deletePosition.mockResolvedValue(null);
    apiMock.addToWatchlist.mockResolvedValue({ ok: true });
    apiMock.removeFromWatchlist.mockResolvedValue({ ok: true });

    fetchMacroAssetsMock.mockResolvedValue([]);
    createBackendSocketMock.mockImplementation(() => ({ close: () => {} }));
  });

  it('executes authenticated config/portfolio actions successfully', async () => {
    const getLatest = renderWithProbe();

    await waitFor(() => {
      expect(getLatest()).toBeTruthy();
      expect(getLatest().state.loading).toBe(false);
    });

    await getLatest().actions.setConfig({ riskProfile: 'agresivo', horizon: 'corto', rsiOS: 25, rsiOB: 75, volThresh: 1.8, minConfluence: 3 });
    await getLatest().actions.addPosition({
      symbol: 'AAPL',
      name: 'Apple',
      category: 'equity',
      buyDate: '2026-02-10',
      buyPrice: 100,
      quantity: 1
    });
    await getLatest().actions.sellPosition('p1', 125, '2026-02-15', 1);
    await getLatest().actions.deletePosition('p1');

    expect(apiMock.updateConfig).toHaveBeenCalledTimes(1);
    expect(apiMock.addPosition).toHaveBeenCalledTimes(1);
    expect(apiMock.updatePosition).toHaveBeenCalledTimes(1);
    expect(apiMock.deletePosition).toHaveBeenCalledTimes(1);
  });

  it('captures authenticated action failures in uiErrors', async () => {
    apiMock.updateConfig.mockRejectedValueOnce(new Error('fail config'));
    apiMock.addPosition.mockRejectedValueOnce(new Error('fail add position'));
    apiMock.updatePosition.mockRejectedValueOnce(new Error('fail sell'));
    apiMock.deletePosition.mockRejectedValueOnce(new Error('fail delete'));

    const getLatest = renderWithProbe();

    await waitFor(() => expect(getLatest().state.loading).toBe(false));

    await getLatest().actions.setConfig({ riskProfile: 'moderado' });
    await getLatest().actions.addPosition({
      symbol: 'AAPL',
      name: 'Apple',
      category: 'equity',
      buyDate: '2026-02-10',
      buyPrice: 100,
      quantity: 1
    });
    await getLatest().actions.sellPosition('p1', 125, '2026-02-15', 1);
    await getLatest().actions.deletePosition('p1');

    await waitFor(() => {
      expect(getLatest().state.uiErrors.some((e) => e.module === 'Config')).toBe(true);
      expect(getLatest().state.uiErrors.filter((e) => e.module === 'Portfolio').length).toBeGreaterThanOrEqual(3);
    });
  });

  it('captures watchlist backend failures for authenticated user', async () => {
    apiMock.addToWatchlist.mockRejectedValueOnce(new Error('fail add watchlist'));
    apiMock.removeFromWatchlist.mockRejectedValueOnce(new Error('fail remove watchlist'));

    const getLatest = renderWithProbe();
    await waitFor(() => expect(getLatest().state.loading).toBe(false));

    await getLatest().actions.addToWatchlist('NFLX');
    await getLatest().actions.removeFromWatchlist('AAPL');

    await waitFor(() => {
      const errors = getLatest().state.uiErrors.filter((e) => e.module === 'Watchlist');
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
