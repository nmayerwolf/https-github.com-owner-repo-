import { describe, expect, it } from 'vitest';
import { appReducer, makeUiError } from '../AppContext';

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
  uiErrors: []
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
});
