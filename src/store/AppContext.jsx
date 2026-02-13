import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { fetchMacroAssets, getAlphaHealth } from '../api/alphavantage';
import { getClaudeHealth } from '../api/claude';
import { createFinnhubSocket, fetchAssetSnapshot, getFinnhubHealth } from '../api/finnhub';
import { calculateIndicators } from '../engine/analysis';
import { buildAlerts, stopLossAlerts } from '../engine/alerts';
import { calculateConfluence } from '../engine/confluence';
import { WATCHLIST_CATALOG } from '../utils/constants';
import { loadPortfolio, savePortfolio } from './portfolioStore';
import { loadConfig, saveConfig } from './configStore';
import { loadWatchlistSymbols, saveWatchlistSymbols } from './watchlistStore';

const AppContext = createContext(null);

const initialState = {
  assets: [],
  loading: true,
  progress: { loaded: 0, total: loadWatchlistSymbols().length },
  alerts: [],
  positions: loadPortfolio(),
  config: loadConfig(),
  watchlistSymbols: loadWatchlistSymbols(),
  lastUpdated: null,
  wsStatus: 'disconnected',
  macroStatus: 'idle',
  apiHealth: {
    finnhub: getFinnhubHealth(),
    alphavantage: getAlphaHealth(),
    claude: getClaudeHealth()
  },
  uiErrors: []
};

export const appReducer = (state, action) => {
  switch (action.type) {
    case 'SET_ASSETS':
      return { ...state, assets: action.payload, lastUpdated: Date.now() };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_PROGRESS':
      return { ...state, progress: action.payload };
    case 'SET_ALERTS':
      return { ...state, alerts: action.payload };
    case 'SET_POSITIONS':
      return { ...state, positions: action.payload };
    case 'SET_CONFIG':
      return { ...state, config: action.payload };
    case 'SET_WS_STATUS':
      return { ...state, wsStatus: action.payload };
    case 'SET_MACRO_STATUS':
      return { ...state, macroStatus: action.payload };
    case 'SET_WATCHLIST':
      return { ...state, watchlistSymbols: action.payload };
    case 'SET_API_HEALTH':
      return { ...state, apiHealth: action.payload };
    case 'PUSH_UI_ERROR':
      return { ...state, uiErrors: [action.payload, ...state.uiErrors].slice(0, 6) };
    case 'DISMISS_UI_ERROR':
      return { ...state, uiErrors: state.uiErrors.filter((e) => e.id !== action.payload) };
    default:
      return state;
  }
};

const updateCandlesWithLivePrice = (candles, price) => {
  if (!candles?.c?.length) return candles;
  const next = {
    ...candles,
    c: [...candles.c],
    h: [...candles.h],
    l: [...candles.l],
    v: [...candles.v]
  };
  const idx = next.c.length - 1;
  next.c[idx] = price;
  next.h[idx] = Math.max(next.h[idx], price);
  next.l[idx] = Math.min(next.l[idx], price);
  return next;
};

const withIndicators = (asset) => {
  const indicators = calculateIndicators({
    closes: asset.candles.c,
    highs: asset.candles.h,
    lows: asset.candles.l,
    volumes: asset.candles.v
  });
  return { ...asset, indicators, signal: null };
};

const resolveWatchlistAssets = (watchlistSymbols) => {
  const bySymbol = Object.fromEntries(WATCHLIST_CATALOG.map((x) => [x.symbol, x]));
  return watchlistSymbols.map((s) => bySymbol[s]).filter(Boolean);
};

export const makeUiError = (module, message) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  module,
  message
});

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const assetsRef = useRef([]);
  const macroLoadedRef = useRef(false);

  useEffect(() => {
    assetsRef.current = state.assets;
  }, [state.assets]);

  useEffect(() => {
    const tick = () => {
      dispatch({
        type: 'SET_API_HEALTH',
        payload: {
          finnhub: getFinnhubHealth(),
          alphavantage: getAlphaHealth(),
          claude: getClaudeHealth()
        }
      });
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  const loadAssets = async (watchlistSymbols = state.watchlistSymbols) => {
    const watchlist = resolveWatchlistAssets(watchlistSymbols);
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_PROGRESS', payload: { loaded: 0, total: watchlist.length } });
    macroLoadedRef.current = false;

    const loaded = [];
    for (let i = 0; i < watchlist.length; i += 1) {
      const meta = watchlist[i];
      const data = await fetchAssetSnapshot(meta);
      if (data?.quote && data?.candles?.c?.length) {
        loaded.push(
          withIndicators({
            ...meta,
            price: data.quote.c,
            prevClose: data.quote.pc,
            changePercent: data.quote.dp,
            candles: data.candles
          })
        );
      } else {
        dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Mercados', `No se pudo cargar ${meta.symbol}.`) });
      }

      dispatch({ type: 'SET_PROGRESS', payload: { loaded: i + 1, total: watchlist.length } });
      dispatch({ type: 'SET_ASSETS', payload: [...loaded] });
    }

    dispatch({ type: 'SET_LOADING', payload: false });
  };

  useEffect(() => {
    loadAssets(state.watchlistSymbols);
  }, []);

  useEffect(() => {
    if (state.loading || !state.assets.length || macroLoadedRef.current) return;
    macroLoadedRef.current = true;
    dispatch({ type: 'SET_MACRO_STATUS', payload: 'loading' });

    fetchMacroAssets()
      .then((macroAssets) => {
        if (!macroAssets?.length) {
          dispatch({ type: 'SET_MACRO_STATUS', payload: 'loaded' });
          return;
        }
        const current = assetsRef.current;
        const existing = new Set(current.map((a) => a.symbol));
        const additions = macroAssets.filter((a) => !existing.has(a.symbol)).map(withIndicators);
        if (!additions.length) {
          dispatch({ type: 'SET_MACRO_STATUS', payload: 'loaded' });
          return;
        }
        dispatch({ type: 'SET_ASSETS', payload: [...current, ...additions] });
        dispatch({ type: 'SET_MACRO_STATUS', payload: 'loaded' });
      })
      .catch(() => {
        dispatch({ type: 'SET_MACRO_STATUS', payload: 'error' });
        dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Macro', 'Falló la carga de Alpha Vantage.') });
      });
  }, [state.loading, state.assets.length]);

  useEffect(() => {
    if (state.loading || !state.assets.length) return undefined;

    const wsSymbols = state.assets.filter((a) => a.source === 'finnhub_stock').map((a) => a.symbol);
    const socket = createFinnhubSocket({
      symbols: wsSymbols,
      onStatus: (status) => {
        dispatch({ type: 'SET_WS_STATUS', payload: status });
        if (status === 'error') dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('WebSocket', 'Error de conexión en tiempo real.') });
      },
      onTrade: ({ symbol, price }) => {
        const current = assetsRef.current;
        const idx = current.findIndex((a) => a.symbol === symbol);
        if (idx < 0) return;

        const prevAsset = current[idx];
        if (!prevAsset.price || !price) return;

        const changeVsLive = Math.abs(((price - prevAsset.price) / prevAsset.price) * 100);
        const nextCandles = updateCandlesWithLivePrice(prevAsset.candles, price);

        let nextIndicators = prevAsset.indicators;
        if (changeVsLive > 0.1) {
          nextIndicators = calculateIndicators({
            closes: nextCandles.c,
            highs: nextCandles.h,
            lows: nextCandles.l,
            volumes: nextCandles.v
          });
        }

        const changePercent = prevAsset.prevClose
          ? ((price - prevAsset.prevClose) / prevAsset.prevClose) * 100
          : ((price - prevAsset.price) / prevAsset.price) * 100;

        const updated = {
          ...prevAsset,
          price,
          changePercent,
          candles: nextCandles,
          indicators: nextIndicators
        };

        const nextAssets = [...current];
        nextAssets[idx] = updated;
        dispatch({ type: 'SET_ASSETS', payload: nextAssets });
      }
    });

    return () => socket.close();
  }, [state.loading]);

  useEffect(() => {
    const enriched = state.assets.map((asset) => ({ ...asset, signal: calculateConfluence(asset, state.config) }));
    const base = buildAlerts(enriched, state.config);
    const bySymbol = Object.fromEntries(enriched.map((a) => [a.symbol, a]));
    const sl = stopLossAlerts(state.positions, bySymbol);
    dispatch({ type: 'SET_ALERTS', payload: [...sl, ...base] });
  }, [state.assets, state.positions, state.config]);

  const actions = useMemo(
    () => ({
      reloadAssets: () => loadAssets(state.watchlistSymbols),
      setConfig: (config) => {
        saveConfig(config);
        dispatch({ type: 'SET_CONFIG', payload: config });
      },
      addPosition: (position) => {
        const next = [...state.positions, position];
        savePortfolio(next);
        dispatch({ type: 'SET_POSITIONS', payload: next });
      },
      sellPosition: (id, sellPrice, sellDate) => {
        const next = state.positions.map((p) => (p.id === id ? { ...p, sellPrice, sellDate } : p));
        savePortfolio(next);
        dispatch({ type: 'SET_POSITIONS', payload: next });
      },
      deletePosition: (id) => {
        const next = state.positions.filter((p) => p.id !== id);
        savePortfolio(next);
        dispatch({ type: 'SET_POSITIONS', payload: next });
      },
      addToWatchlist: async (symbol) => {
        if (!symbol || state.watchlistSymbols.includes(symbol)) return;
        const meta = WATCHLIST_CATALOG.find((x) => x.symbol === symbol);
        if (!meta) return;

        const nextWatchlist = [...state.watchlistSymbols, symbol];
        saveWatchlistSymbols(nextWatchlist);
        dispatch({ type: 'SET_WATCHLIST', payload: nextWatchlist });

        const data = await fetchAssetSnapshot(meta);
        if (!(data?.quote && data?.candles?.c?.length)) {
          dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Watchlist', `No se pudo agregar ${symbol}.`) });
          return;
        }

        const nextAsset = withIndicators({
          ...meta,
          price: data.quote.c,
          prevClose: data.quote.pc,
          changePercent: data.quote.dp,
          candles: data.candles
        });

        const current = assetsRef.current;
        if (current.some((x) => x.symbol === nextAsset.symbol)) return;
        dispatch({ type: 'SET_ASSETS', payload: [...current, nextAsset] });
      },
      removeFromWatchlist: (symbol) => {
        const nextWatchlist = state.watchlistSymbols.filter((s) => s !== symbol);
        saveWatchlistSymbols(nextWatchlist);
        dispatch({ type: 'SET_WATCHLIST', payload: nextWatchlist });
        const current = assetsRef.current;
        dispatch({ type: 'SET_ASSETS', payload: current.filter((a) => a.symbol !== symbol) });
      },
      getAssetBySymbol: (symbol) => state.assets.find((a) => a.symbol === symbol),
      dismissUiError: (id) => dispatch({ type: 'DISMISS_UI_ERROR', payload: id })
    }),
    [state.positions, state.assets, state.watchlistSymbols]
  );

  return <AppContext.Provider value={{ state, actions }}>{children}</AppContext.Provider>;
};

export const useApp = () => useContext(AppContext);
