import { describe, expect, it } from 'vitest';
import { appReducer, buildRealtimeSymbolMap, makeUiError, mapServerAlertToLive } from '../AppContext';

const baseState = {
  assets: [],
  loading: false,
  progress: { loaded: 0, total: 0 },
  alerts: [],
  positions: [],
  config: {},
  watchlistSymbols: ['AAPL', 'MSFT'],
  lastUpdated: null,
  wsStatus: 'disconnected',
  macroStatus: 'idle',
  apiHealth: { finnhub: {}, alphavantage: {}, claude: {} },
  uiErrors: [],
  realtimeAlerts: []
};

describe('appReducer', () => {
  it('updates watchlist via SET_WATCHLIST', () => {
    const next = appReducer(baseState, { type: 'SET_WATCHLIST', payload: ['AAPL', 'NVDA'] });
    expect(next.watchlistSymbols).toEqual(['AAPL', 'NVDA']);
  });

  it('transitions macro status', () => {
    const loading = appReducer(baseState, { type: 'SET_MACRO_STATUS', payload: 'loading' });
    const loaded = appReducer(loading, { type: 'SET_MACRO_STATUS', payload: 'loaded' });
    expect(loading.macroStatus).toBe('loading');
    expect(loaded.macroStatus).toBe('loaded');
  });

  it('pushes and dismisses ui errors', () => {
    const e1 = makeUiError('Macro', 'Fallo 1');
    const e2 = makeUiError('WebSocket', 'Fallo 2');

    const withErrors = appReducer(appReducer(baseState, { type: 'PUSH_UI_ERROR', payload: e1 }), {
      type: 'PUSH_UI_ERROR',
      payload: e2
    });

    expect(withErrors.uiErrors.length).toBe(2);
    expect(withErrors.uiErrors[0].id).toBe(e2.id);

    const dismissed = appReducer(withErrors, { type: 'DISMISS_UI_ERROR', payload: e2.id });
    expect(dismissed.uiErrors.length).toBe(1);
    expect(dismissed.uiErrors[0].id).toBe(e1.id);
  });

  it('caps ui error list to 6 items', () => {
    let state = baseState;
    for (let i = 0; i < 8; i += 1) {
      state = appReducer(state, { type: 'PUSH_UI_ERROR', payload: makeUiError('M', `Err ${i}`) });
    }
    expect(state.uiErrors.length).toBe(6);
  });

  it('pushes and clears realtime alerts', () => {
    const mapped = mapServerAlertToLive({
      id: 'a1',
      symbol: 'nvda',
      type: 'opportunity',
      recommendation: 'BUY',
      confidence: 'high',
      stop_loss: 100,
      take_profit: 130
    });

    const withRealtime = appReducer(baseState, { type: 'PUSH_REALTIME_ALERT', payload: mapped });
    expect(withRealtime.realtimeAlerts.length).toBe(1);
    expect(withRealtime.realtimeAlerts[0].type).toBe('compra');
    expect(withRealtime.realtimeAlerts[0].symbol).toBe('NVDA');

    const deduped = appReducer(withRealtime, { type: 'PUSH_REALTIME_ALERT', payload: mapped });
    expect(deduped.realtimeAlerts.length).toBe(1);

    const cleared = appReducer(deduped, { type: 'CLEAR_REALTIME_ALERTS' });
    expect(cleared.realtimeAlerts).toEqual([]);
  });

  it('builds realtime symbol map for stock, crypto and fx', () => {
    const out = buildRealtimeSymbolMap([
      { symbol: 'aapl', source: 'finnhub_stock' },
      { symbol: 'btcusdt', source: 'finnhub_crypto' },
      { symbol: 'eur_usd', source: 'finnhub_fx' },
      { symbol: 'XAU', source: 'alphavantage_macro' },
      { symbol: 'US10Y', source: 'alphavantage_macro' }
    ]);

    expect(out).toEqual({
      AAPL: 'AAPL',
      'BINANCE:BTCUSDT': 'BTCUSDT',
      'OANDA:EUR_USD': 'EUR_USD',
      'AV:GOLD': 'XAU',
      'AV:TREASURY_YIELD:10YEAR': 'US10Y'
    });
  });
});
