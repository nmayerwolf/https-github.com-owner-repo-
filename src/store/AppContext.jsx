import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { fetchMacroAssets, getAlphaHealth } from '../api/alphavantage';
import { api } from '../api/apiClient';
import { getClaudeHealth } from '../api/claude';
import { createFinnhubSocket, fetchAssetSnapshot, getFinnhubHealth } from '../api/finnhub';
import { createBackendSocket } from '../api/realtime';
import { calculateIndicators } from '../engine/analysis';
import { buildAlerts, stopLossAlerts } from '../engine/alerts';
import { calculateConfluence } from '../engine/confluence';
import { WATCHLIST_CATALOG } from '../utils/constants';
import { useAuth } from './AuthContext';
import { loadPortfolio, savePortfolio } from './portfolioStore';
import { loadConfig, saveConfig } from './configStore';
import { loadWatchlistSymbols, saveWatchlistSymbols } from './watchlistStore';

const AppContext = createContext(null);
const ASSET_CACHE_KEY = 'nexusfin_assets_cache_v1';
const INITIAL_BLOCKING_ASSET_LOAD = 4;

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
  uiErrors: [],
  realtimeAlerts: [],
  sourceMode: 'local'
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
      if (!action.payload?.module || !action.payload?.message) {
        return { ...state, uiErrors: [action.payload, ...state.uiErrors].slice(0, 6) };
      }
      if (state.uiErrors.some((e) => e.module === action.payload.module && e.message === action.payload.message)) {
        return state;
      }
      return { ...state, uiErrors: [action.payload, ...state.uiErrors].slice(0, 6) };
    case 'DISMISS_UI_ERROR':
      return { ...state, uiErrors: state.uiErrors.filter((e) => e.id !== action.payload) };
    case 'PUSH_REALTIME_ALERT': {
      const incoming = action.payload;
      if (!incoming?.id) return state;
      const already = state.realtimeAlerts.some((a) => a.id === incoming.id);
      if (already) return state;
      return { ...state, realtimeAlerts: [incoming, ...state.realtimeAlerts].slice(0, 30) };
    }
    case 'CLEAR_REALTIME_ALERTS':
      return { ...state, realtimeAlerts: [] };
    case 'SET_SOURCE_MODE':
      return { ...state, sourceMode: action.payload };
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

const buildSyntheticCandles = (price, prevClose = null, points = 90) => {
  const current = Number(price);
  const previous = Number(prevClose);
  if (!Number.isFinite(current) || current <= 0) return null;
  const start = Number.isFinite(previous) && previous > 0 ? previous : current;
  const step = points > 1 ? (current - start) / (points - 1) : 0;
  const c = Array.from({ length: points }, (_, idx) => Number((start + step * idx).toFixed(6)));
  return {
    c,
    h: c.map((v) => Number((v * 1.002).toFixed(6))),
    l: c.map((v) => Number((v * 0.998).toFixed(6))),
    v: c.map(() => 0)
  };
};

const toWsMarketSymbol = (asset) => {
  if (!asset?.symbol) return null;
  if (asset.source === 'finnhub_stock') return String(asset.symbol).toUpperCase();
  if (asset.source === 'finnhub_crypto') return `BINANCE:${String(asset.symbol).toUpperCase()}`;
  if (asset.source === 'finnhub_fx') return `OANDA:${String(asset.symbol).toUpperCase()}`;
  if (asset.source === 'alphavantage_macro') {
    const key = String(asset.symbol).toUpperCase();
    if (key === 'XAU') return 'AV:GOLD';
    if (key === 'XAG') return 'AV:SILVER';
    if (key === 'XPT') return 'AV:PLATINUM';
    if (key === 'XCU') return 'AV:COPPER';
    if (key === 'CL') return 'AV:WTI';
    if (key === 'BRN') return 'AV:BRENT';
    if (key === 'NG') return 'AV:NATURAL_GAS';
    if (key === 'US2Y') return 'AV:TREASURY_YIELD:2YEAR';
    if (key === 'US5Y') return 'AV:TREASURY_YIELD:5YEAR';
    if (key === 'US10Y') return 'AV:TREASURY_YIELD:10YEAR';
    if (key === 'US30Y') return 'AV:TREASURY_YIELD:30YEAR';
  }
  return null;
};

export const buildRealtimeSymbolMap = (assets = []) =>
  assets.reduce((acc, asset) => {
    const wsSymbol = toWsMarketSymbol(asset);
    if (!wsSymbol) return acc;
    acc[wsSymbol] = String(asset.symbol || '').toUpperCase();
    return acc;
  }, {});

const withIndicators = (asset) => {
  const indicators = calculateIndicators({
    closes: asset.candles.c,
    highs: asset.candles.h,
    lows: asset.candles.l,
    volumes: asset.candles.v
  });
  return { ...asset, indicators, signal: null };
};

export const mapServerAlertToLive = (alert) => {
  const normalizedType =
    alert?.type === 'opportunity' ? 'compra' : alert?.type === 'bearish' ? 'venta' : alert?.type === 'stop_loss' ? 'stoploss' : 'all';
  const symbol = String(alert?.symbol || '').toUpperCase();

  const stopLoss = alert?.stopLoss ?? alert?.stop_loss ?? null;
  const takeProfit = alert?.takeProfit ?? alert?.take_profit ?? null;

  return {
    id: `srv-${alert?.id || `${symbol}-${Date.now()}`}`,
    type: normalizedType,
    symbol,
    priority: 3,
    confidence: alert?.confidence || 'high',
    title: alert?.recommendation ? `${alert.recommendation} en ${symbol}` : `Nueva señal en ${symbol}`,
    stopLoss: stopLoss != null ? Number(stopLoss) : null,
    takeProfit: takeProfit != null ? Number(takeProfit) : null
  };
};

const resolveWatchlistAssets = (watchlistSymbols) => {
  const bySymbol = Object.fromEntries(WATCHLIST_CATALOG.map((x) => [x.symbol, x]));
  return watchlistSymbols.map((s) => bySymbol[s]).filter(Boolean);
};

const normalizePosition = (row) => ({
  id: row.id,
  symbol: row.symbol,
  name: row.name,
  category: row.category,
  buyDate: row.buyDate || row.buy_date,
  buyPrice: Number(row.buyPrice ?? row.buy_price),
  quantity: Number(row.quantity),
  sellDate: row.sellDate || row.sell_date || null,
  sellPrice: row.sellPrice || row.sell_price ? Number(row.sellPrice ?? row.sell_price) : null,
  notes: row.notes || ''
});

const fetchSnapshotViaProxy = async (meta) => {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = nowSec - 60 * 60 * 24 * 90;

    if (meta.source === 'finnhub_stock') {
      const quote = await api.quote(meta.symbol);
      const candles = await api.candles(meta.symbol, fromSec, nowSec).catch(() => null);
      const safeCandles = candles?.c?.length ? candles : buildSyntheticCandles(quote?.c, quote?.pc);
      if (!safeCandles) return null;
      return { quote, candles: safeCandles };
    }

    if (meta.source === 'finnhub_crypto') {
      const quote = await api.quote(`BINANCE:${meta.symbol}`);
      const candles = await api.cryptoCandles(meta.symbol, fromSec, nowSec).catch(() => null);
      const safeCandles = candles?.c?.length ? candles : buildSyntheticCandles(quote?.c, quote?.pc);
      if (!safeCandles) return null;
      return { quote, candles: safeCandles };
    }

    if (meta.source === 'finnhub_fx') {
      const [base, quote] = meta.symbol.split('_');
      const fxQuote = await api.quote(`OANDA:${meta.symbol}`);
      const fxCandles = await api.forexCandles(base, quote, fromSec, nowSec).catch(() => null);
      const safeCandles = fxCandles?.c?.length ? fxCandles : buildSyntheticCandles(fxQuote?.c, fxQuote?.pc);
      if (!safeCandles) return null;
      return { quote: fxQuote, candles: safeCandles };
    }

    return null;
  } catch {
    return null;
  }
};

export const makeUiError = (module, message) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  module,
  message
});

const readAssetCache = () => {
  try {
    const raw = localStorage.getItem(ASSET_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !Array.isArray(parsed.assets) || !parsed.assets.length) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveAssetCache = (assets) => {
  try {
    if (!Array.isArray(assets) || !assets.length) return;
    localStorage.setItem(
      ASSET_CACHE_KEY,
      JSON.stringify({
        ts: Date.now(),
        assets
      })
    );
  } catch {
    // Ignore local cache failures.
  }
};

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const assetsRef = useRef([]);
  const macroLoadedRef = useRef(false);
  const realtimeMapRef = useRef({});
  const auth = useAuth();
  const isAuthenticated = !!auth?.isAuthenticated;

  useEffect(() => {
    assetsRef.current = state.assets;
  }, [state.assets]);

  useEffect(() => {
    saveAssetCache(state.assets);
  }, [state.assets]);

  useEffect(() => {
    dispatch({ type: 'SET_SOURCE_MODE', payload: isAuthenticated ? 'remote' : 'local' });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      dispatch({ type: 'CLEAR_REALTIME_ALERTS' });
    }
  }, [isAuthenticated]);

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

  const syncRemoteUserData = async () => {
    if (!isAuthenticated) return;

    try {
      const [portfolio, config, watchlist] = await Promise.all([api.getPortfolio(), api.getConfig(), api.getWatchlist()]);

      const positions = (portfolio?.positions || []).map(normalizePosition);
      const configNext = config || loadConfig();
      const symbols = (watchlist?.symbols || []).map((x) => x.symbol);

      dispatch({ type: 'SET_POSITIONS', payload: positions });
      dispatch({ type: 'SET_CONFIG', payload: configNext });
      dispatch({ type: 'SET_WATCHLIST', payload: symbols.length ? symbols : state.watchlistSymbols });
    } catch {
      dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Sync', 'No se pudo sincronizar datos de usuario desde backend.') });
    }
  };

  const loadAssets = async (watchlistSymbols = state.watchlistSymbols) => {
    const watchlist = resolveWatchlistAssets(watchlistSymbols);
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_PROGRESS', payload: { loaded: 0, total: watchlist.length } });
    macroLoadedRef.current = false;
    const cached = readAssetCache();

    const loaded = [];
    let failedLoads = 0;
    const pushAsset = (meta, data) => {
      loaded.push(
        withIndicators({
          ...meta,
          price: data.quote.c,
          prevClose: data.quote.pc,
          changePercent: data.quote.dp,
          candles: data.candles
        })
      );
    };

    const loadSingle = async (meta, index) => {
      const data = isAuthenticated ? await fetchSnapshotViaProxy(meta) : await fetchAssetSnapshot(meta);
      if (data?.quote && data?.candles?.c?.length) {
        pushAsset(meta, data);
      } else {
        if (failedLoads < 3) {
          dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Mercados', `No se pudo cargar ${meta.symbol}.`) });
        }
        failedLoads += 1;
      }
      dispatch({ type: 'SET_PROGRESS', payload: { loaded: index + 1, total: watchlist.length } });
      dispatch({ type: 'SET_ASSETS', payload: [...loaded] });
    };

    const firstSliceEnd = Math.min(INITIAL_BLOCKING_ASSET_LOAD, watchlist.length);
    for (let i = 0; i < firstSliceEnd; i += 1) {
      const meta = watchlist[i];
      await loadSingle(meta, i);
    }

    if (!loaded.length) {
      if (cached?.assets?.length) {
        dispatch({ type: 'SET_ASSETS', payload: cached.assets });
        dispatch({
          type: 'PUSH_UI_ERROR',
          payload: makeUiError('Offline', 'Sin conexión al mercado en tiempo real. Mostrando últimos datos en cache.')
        });
      }
    }

    dispatch({ type: 'SET_LOADING', payload: false });

    if (firstSliceEnd >= watchlist.length) return;

    (async () => {
      for (let i = firstSliceEnd; i < watchlist.length; i += 1) {
        const meta = watchlist[i];
        await loadSingle(meta, i);
      }

      if (!loaded.length && cached?.assets?.length) {
        dispatch({ type: 'SET_ASSETS', payload: cached.assets });
      }
    })();
  };

  useEffect(() => {
    const run = async () => {
      if (isAuthenticated) {
        await syncRemoteUserData();
      }
      await loadAssets(state.watchlistSymbols);
    };

    run();
  }, [isAuthenticated]);

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

  const realtimeSymbolMap = useMemo(() => buildRealtimeSymbolMap(state.assets), [state.assets]);
  const wsSymbolKey = useMemo(() => Object.keys(realtimeSymbolMap).sort().join(','), [realtimeSymbolMap]);

  useEffect(() => {
    realtimeMapRef.current = realtimeSymbolMap;
  }, [realtimeSymbolMap]);

  useEffect(() => {
    if (state.loading || !state.assets.length) return undefined;
    const wsSymbols = wsSymbolKey
      ? wsSymbolKey
          .split(',')
          .filter(Boolean)
          .filter((symbol) => (isAuthenticated ? true : !symbol.startsWith('AV:')))
      : [];
    if (!wsSymbols.length) return undefined;

    const socketFactory = isAuthenticated ? createBackendSocket : createFinnhubSocket;
    const socket = socketFactory({
      symbols: wsSymbols,
      onStatus: (status) => {
        dispatch({ type: 'SET_WS_STATUS', payload: status });
        if (status === 'error') dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('WebSocket', 'Error de conexión en tiempo real.') });
      },
      onTrade: ({ symbol, price }) => {
        const current = assetsRef.current;
        const incoming = String(symbol || '').toUpperCase();
        const internalSymbol = realtimeMapRef.current[incoming] || incoming;
        const idx = current.findIndex((a) => String(a.symbol || '').toUpperCase() === internalSymbol);
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
      },
      onAlert: (alert) => {
        dispatch({ type: 'PUSH_REALTIME_ALERT', payload: mapServerAlertToLive(alert) });
      }
    });

    return () => socket.close();
  }, [state.loading, isAuthenticated, wsSymbolKey, state.assets.length]);

  useEffect(() => {
    const enriched = state.assets.map((asset) => ({ ...asset, signal: calculateConfluence(asset, state.config) }));
    const base = buildAlerts(enriched, state.config);
    const bySymbol = Object.fromEntries(enriched.map((a) => [a.symbol, a]));
    const sl = stopLossAlerts(state.positions, bySymbol);
    dispatch({ type: 'SET_ALERTS', payload: [...state.realtimeAlerts, ...sl, ...base] });
  }, [state.assets, state.positions, state.config, state.realtimeAlerts]);

  const actions = useMemo(
    () => ({
      reloadAssets: () => loadAssets(state.watchlistSymbols),
      setConfig: async (config) => {
        if (isAuthenticated) {
          try {
            const out = await api.updateConfig(config);
            dispatch({ type: 'SET_CONFIG', payload: out });
            return;
          } catch {
            dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Config', 'No se pudo guardar configuración en backend.') });
          }
        }

        saveConfig(config);
        dispatch({ type: 'SET_CONFIG', payload: config });
      },
      addPosition: async (position) => {
        if (isAuthenticated) {
          try {
            const payload = {
              symbol: position.symbol,
              name: position.name,
              category: position.category,
              buyDate: position.buyDate,
              buyPrice: Number(position.buyPrice),
              quantity: Number(position.quantity),
              notes: position.notes || ''
            };
            const out = await api.addPosition(payload);
            dispatch({ type: 'SET_POSITIONS', payload: [normalizePosition(out), ...state.positions] });
            return;
          } catch {
            dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Portfolio', 'No se pudo agregar la posición.') });
            return;
          }
        }

        const next = [...state.positions, position];
        savePortfolio(next);
        dispatch({ type: 'SET_POSITIONS', payload: next });
      },
      sellPosition: async (id, sellPrice, sellDate) => {
        if (isAuthenticated) {
          try {
            const out = await api.updatePosition(id, { sellPrice, sellDate });
            const updated = normalizePosition(out);
            dispatch({ type: 'SET_POSITIONS', payload: state.positions.map((p) => (p.id === id ? updated : p)) });
            return;
          } catch {
            dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Portfolio', 'No se pudo vender la posición.') });
            return;
          }
        }

        const next = state.positions.map((p) => (p.id === id ? { ...p, sellPrice, sellDate } : p));
        savePortfolio(next);
        dispatch({ type: 'SET_POSITIONS', payload: next });
      },
      deletePosition: async (id) => {
        if (isAuthenticated) {
          try {
            await api.deletePosition(id);
            dispatch({ type: 'SET_POSITIONS', payload: state.positions.filter((p) => p.id !== id) });
            return;
          } catch {
            dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Portfolio', 'No se pudo eliminar la posición.') });
            return;
          }
        }

        const next = state.positions.filter((p) => p.id !== id);
        savePortfolio(next);
        dispatch({ type: 'SET_POSITIONS', payload: next });
      },
      addToWatchlist: async (symbol) => {
        if (!symbol || state.watchlistSymbols.includes(symbol)) return;
        const meta = WATCHLIST_CATALOG.find((x) => x.symbol === symbol);
        if (!meta) return;

        const nextWatchlist = [...state.watchlistSymbols, symbol];

        if (isAuthenticated) {
          try {
            await api.addToWatchlist({ symbol: meta.symbol, name: meta.name, type: 'stock', category: meta.category });
          } catch {
            dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Watchlist', `No se pudo agregar ${symbol} en backend.`) });
            return;
          }
        } else {
          saveWatchlistSymbols(nextWatchlist);
        }

        dispatch({ type: 'SET_WATCHLIST', payload: nextWatchlist });

        const data = isAuthenticated ? await fetchSnapshotViaProxy(meta) : await fetchAssetSnapshot(meta);
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
      removeFromWatchlist: async (symbol) => {
        const nextWatchlist = state.watchlistSymbols.filter((s) => s !== symbol);

        if (isAuthenticated) {
          try {
            await api.removeFromWatchlist(symbol);
          } catch {
            dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Watchlist', `No se pudo quitar ${symbol} en backend.`) });
            return;
          }
        } else {
          saveWatchlistSymbols(nextWatchlist);
        }

        dispatch({ type: 'SET_WATCHLIST', payload: nextWatchlist });
        const current = assetsRef.current;
        dispatch({ type: 'SET_ASSETS', payload: current.filter((a) => a.symbol !== symbol) });
      },
      getAssetBySymbol: (symbol) => state.assets.find((a) => a.symbol === symbol),
      dismissUiError: (id) => dispatch({ type: 'DISMISS_UI_ERROR', payload: id })
    }),
    [state.positions, state.assets, state.watchlistSymbols, isAuthenticated]
  );

  return <AppContext.Provider value={{ state, actions }}>{children}</AppContext.Provider>;
};

export const useApp = () => useContext(AppContext);
