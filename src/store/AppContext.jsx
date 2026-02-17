import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { fetchMacroAssets, getAlphaHealth } from '../api/alphavantage';
import { api } from '../api/apiClient';
import { getClaudeHealth } from '../api/claude';
import { createFinnhubSocket, fetchAssetSnapshot, getFinnhubHealth, recordFinnhubProxyStats } from '../api/finnhub';
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
const INITIAL_BLOCKING_ASSET_LOAD = 6;
const BULK_SNAPSHOT_BATCH_SIZE = 3;

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
      if (
        action.payload.key &&
        state.uiErrors.some((e) => e.module === action.payload.module && e.key && e.key === action.payload.key)
      ) {
        return state;
      }
      if (state.uiErrors.some((e) => e.module === action.payload.module && e.message === action.payload.message)) {
        return state;
      }
      return { ...state, uiErrors: [action.payload, ...state.uiErrors].slice(0, 6) };
    case 'DISMISS_UI_ERROR':
      return { ...state, uiErrors: state.uiErrors.filter((e) => e.id !== action.payload) };
    case 'DISMISS_UI_ERRORS_BY_MODULE':
      return { ...state, uiErrors: state.uiErrors.filter((e) => e.module !== action.payload) };
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
  return watchlistSymbols
    .map((symbol) => {
      const normalized = String(symbol || '').toUpperCase();
      if (bySymbol[normalized]) return bySymbol[normalized];
      if (!normalized) return null;
      if (normalized.endsWith('USDT')) {
        return { symbol: normalized, name: normalized, category: 'crypto', sector: 'crypto', source: 'finnhub_crypto' };
      }
      if (normalized.includes('_')) {
        return { symbol: normalized, name: normalized.replace('_', '/'), category: 'fx', sector: 'fx', source: 'finnhub_fx' };
      }
      return { symbol: normalized, name: normalized, category: 'equity', sector: 'equity', source: 'finnhub_stock' };
    })
    .filter(Boolean);
};

const STOP_LOSS_PCT_TOKEN = /\[SLP:([0-9]+(?:\.[0-9]+)?)\]/i;
const TAKE_PROFIT_PCT_TOKEN = /\[TPP:([0-9]+(?:\.[0-9]+)?)\]/i;
const STOP_LOSS_PRICE_TOKEN = /\[SL:([0-9]+(?:\.[0-9]+)?)\]/i;
const TAKE_PROFIT_PRICE_TOKEN = /\[TP:([0-9]+(?:\.[0-9]+)?)\]/i;

const parseStopLossPctFromNotes = (notes) => {
  const text = String(notes || '');
  const match = text.match(STOP_LOSS_PCT_TOKEN);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const parseStopLossPriceFromNotes = (notes) => {
  const text = String(notes || '');
  const match = text.match(STOP_LOSS_PRICE_TOKEN);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const parseTakeProfitPctFromNotes = (notes) => {
  const text = String(notes || '');
  const match = text.match(TAKE_PROFIT_PCT_TOKEN);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const parseTakeProfitPriceFromNotes = (notes) => {
  const text = String(notes || '');
  const match = text.match(TAKE_PROFIT_PRICE_TOKEN);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const withRiskTokens = (notes, stopLossPct, takeProfitPct) => {
  const base = String(notes || '')
    .replace(STOP_LOSS_PCT_TOKEN, '')
    .replace(TAKE_PROFIT_PCT_TOKEN, '')
    .replace(STOP_LOSS_PRICE_TOKEN, '')
    .replace(TAKE_PROFIT_PRICE_TOKEN, '')
    .trim();
  const sl = Number(stopLossPct);
  const tp = Number(takeProfitPct);
  const tokens = [];
  if (Number.isFinite(sl) && sl > 0) tokens.push(`[SLP:${sl}]`);
  if (Number.isFinite(tp) && tp > 0) tokens.push(`[TPP:${tp}]`);
  if (!tokens.length) return base;
  return base ? `${tokens.join(' ')} ${base}` : tokens.join(' ');
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
  notes: row.notes || '',
  stopLossPct: parseStopLossPctFromNotes(row.notes),
  stopLoss: parseStopLossPriceFromNotes(row.notes),
  takeProfitPct: parseTakeProfitPctFromNotes(row.notes),
  takeProfit: parseTakeProfitPriceFromNotes(row.notes)
});

const fetchSnapshotViaProxy = async (meta) => {
  try {
    const out = await api.snapshot([meta.symbol]);
    const item = (out?.items || []).find((x) => String(x?.symbol || '').toUpperCase() === String(meta.symbol || '').toUpperCase());
    if (!item?.quote || !item?.candles?.c?.length) {
      recordFinnhubProxyStats({ calls: 1, errors: 1, lastError: 'snapshot missing item' });
      return null;
    }
    recordFinnhubProxyStats({ calls: 1, fallbacks: item?.quote?.fallback ? 1 : 0 });
    return { quote: item.quote, candles: item.candles };
  } catch (error) {
    recordFinnhubProxyStats({ calls: 1, errors: 1, lastError: error?.message || 'snapshot proxy failed' });
    return null;
  }
};

const fetchSnapshotBatchViaProxy = async (metaBatch = []) => {
  try {
    const symbols = metaBatch.map((x) => x.symbol).filter(Boolean);
    if (!symbols.length) return { okBySymbol: {}, failedSymbols: [] };
    const out = await api.snapshot(symbols);
    const okBySymbol = {};
    for (const item of out?.items || []) {
      const symbol = String(item?.symbol || '').toUpperCase();
      if (!symbol) continue;
      recordFinnhubProxyStats({ calls: 1, fallbacks: item?.quote?.fallback ? 1 : 0 });
      okBySymbol[symbol] = { quote: item.quote, candles: item.candles };
    }
    const failedSymbols = (out?.errors || []).map((x) => String(x?.symbol || '').toUpperCase()).filter(Boolean);
    if (failedSymbols.length) {
      recordFinnhubProxyStats({ errors: failedSymbols.length, lastError: out?.errors?.[0]?.message || 'snapshot symbols failed' });
    }
    return { okBySymbol, failedSymbols };
  } catch {
    recordFinnhubProxyStats({ errors: metaBatch.length, lastError: 'snapshot batch failed' });
    return { okBySymbol: {}, failedSymbols: metaBatch.map((x) => String(x?.symbol || '').toUpperCase()).filter(Boolean) };
  }
};

export const makeUiError = (module, message, key = null) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  module,
  message,
  key
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

const formatCacheTimestamp = (ts) => {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return null;
  try {
    return new Date(value).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  } catch {
    return null;
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
    dispatch({ type: 'DISMISS_UI_ERRORS_BY_MODULE', payload: 'WebSocket' });
    if (!isAuthenticated) {
      dispatch({ type: 'SET_WS_STATUS', payload: 'disconnected' });
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
      dispatch({
        type: 'PUSH_UI_ERROR',
        payload: makeUiError('Sync', 'No se pudo sincronizar datos de usuario desde backend.', 'sync-remote-user-data')
      });
    }
  };

  const loadAssets = async (watchlistSymbols = state.watchlistSymbols) => {
    const watchlist = resolveWatchlistAssets(watchlistSymbols);
    const cached = readAssetCache();
    const hasWarmCache = Boolean(cached?.assets?.length);

    if (hasWarmCache) {
      dispatch({ type: 'SET_ASSETS', payload: cached.assets });
      dispatch({ type: 'SET_LOADING', payload: false });
    } else {
      dispatch({ type: 'SET_LOADING', payload: true });
    }

    dispatch({ type: 'SET_PROGRESS', payload: { loaded: 0, total: watchlist.length } });
    macroLoadedRef.current = false;

    const loaded = [];
    let failedLoads = 0;
    let marketErrorRaised = false;
    const pushMarketError = (message, key) => {
      if (marketErrorRaised) return;
      marketErrorRaised = true;
      dispatch({
        type: 'PUSH_UI_ERROR',
        payload: makeUiError('Mercados', message, key)
      });
    };
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
          pushMarketError('No se pudieron cargar algunos activos del mercado.', 'markets-initial-load');
        }
        failedLoads += 1;
      }
      dispatch({ type: 'SET_PROGRESS', payload: { loaded: index + 1, total: watchlist.length } });
      dispatch({ type: 'SET_ASSETS', payload: [...loaded] });
    };

    const loadBatch = async (metaBatch, startIndex) => {
      if (!metaBatch.length) return;
      if (!isAuthenticated) {
        for (let i = 0; i < metaBatch.length; i += 1) {
          await loadSingle(metaBatch[i], startIndex + i);
        }
        return;
      }

      const { okBySymbol, failedSymbols } = await fetchSnapshotBatchViaProxy(metaBatch);
      for (let i = 0; i < metaBatch.length; i += 1) {
        const meta = metaBatch[i];
        const symbol = String(meta.symbol || '').toUpperCase();
        const data = okBySymbol[symbol];

        if (data?.quote && data?.candles?.c?.length) {
          pushAsset(meta, data);
        } else {
          if (failedLoads < 3) {
            pushMarketError('No se pudieron cargar algunos activos del mercado.', 'markets-initial-load');
          }
          failedLoads += 1;
        }

        const processed = startIndex + i + 1;
        dispatch({ type: 'SET_PROGRESS', payload: { loaded: processed, total: watchlist.length } });
      }

      if (failedSymbols.length && failedLoads < 3) {
        pushMarketError(`Sin datos para ${failedSymbols.slice(0, 2).join(', ')}.`, 'markets-snapshot-missing');
      }

      dispatch({ type: 'SET_ASSETS', payload: [...loaded] });
    };

    const firstSliceEnd = hasWarmCache ? 0 : Math.min(INITIAL_BLOCKING_ASSET_LOAD, watchlist.length);
    if (firstSliceEnd > 0) {
      await loadBatch(watchlist.slice(0, firstSliceEnd), 0);
    }

    if (!loaded.length) {
      if (cached?.assets?.length) {
        const cacheStamp = formatCacheTimestamp(cached.ts);
        dispatch({ type: 'SET_ASSETS', payload: cached.assets });
        dispatch({
          type: 'PUSH_UI_ERROR',
          payload: makeUiError(
            'Offline',
            cacheStamp
              ? `Sin conexión al mercado en tiempo real. Mostrando cache de ${cacheStamp}.`
              : 'Sin conexión al mercado en tiempo real. Mostrando últimos datos en cache.',
            'offline-cache-fallback'
          )
        });
      }
    }

    dispatch({ type: 'SET_LOADING', payload: false });

    if (firstSliceEnd >= watchlist.length) return;

    (async () => {
      for (let i = firstSliceEnd; i < watchlist.length; i += BULK_SNAPSHOT_BATCH_SIZE) {
        const batch = watchlist.slice(i, i + BULK_SNAPSHOT_BATCH_SIZE);
        await loadBatch(batch, i);
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
        dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Macro', 'Falló la carga de Alpha Vantage.', 'macro-load') });
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
        if (status === 'connected') {
          dispatch({ type: 'DISMISS_UI_ERRORS_BY_MODULE', payload: 'WebSocket' });
          return;
        }
        if (status === 'auth_error') {
          dispatch({
            type: 'PUSH_UI_ERROR',
            payload: makeUiError('WebSocket', 'Sesión expirada para tiempo real. Reingresá para reconectar WS.', 'ws-auth-error')
          });
        }
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
        const mergedNotes = withRiskTokens(position.notes || '', position.stopLossPct, position.takeProfitPct);
        if (isAuthenticated) {
          try {
            const payload = {
              symbol: position.symbol,
              name: position.name,
              category: position.category,
              buyDate: position.buyDate,
              buyPrice: Number(position.buyPrice),
              quantity: Number(position.quantity),
              notes: mergedNotes
            };
            const out = await api.addPosition(payload);
            dispatch({ type: 'SET_POSITIONS', payload: [normalizePosition(out), ...state.positions] });
            return;
          } catch {
            dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Portfolio', 'No se pudo agregar la posición.') });
            return;
          }
        }

        const next = [
          ...state.positions,
          {
            ...position,
            notes: mergedNotes,
            stopLossPct: Number(position.stopLossPct) || null,
            stopLoss: null,
            takeProfitPct: Number(position.takeProfitPct) || null,
            takeProfit: null
          }
        ];
        savePortfolio(next);
        dispatch({ type: 'SET_POSITIONS', payload: next });
      },
      setPositionRiskTargets: async (id, { stopLossPct, takeProfitPct }) => {
        const current = state.positions.find((p) => p.id === id);
        if (!current) return;
        const nextNotes = withRiskTokens(current.notes || '', stopLossPct, takeProfitPct);

        if (isAuthenticated) {
          try {
            const out = await api.updatePosition(id, { notes: nextNotes });
            const updated = normalizePosition(out);
            dispatch({ type: 'SET_POSITIONS', payload: state.positions.map((p) => (p.id === id ? updated : p)) });
            return;
          } catch {
            dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Portfolio', 'No se pudo guardar SL/TP de la posición.') });
            return;
          }
        }

        const next = state.positions.map((p) =>
          p.id === id
            ? {
                ...p,
                notes: nextNotes,
                stopLossPct: Number(stopLossPct) || null,
                stopLoss: null,
                takeProfitPct: Number(takeProfitPct) || null,
                takeProfit: null
              }
            : p
        );
        savePortfolio(next);
        dispatch({ type: 'SET_POSITIONS', payload: next });
      },
      sellPosition: async (id, sellPrice, sellDate, sellQuantity) => {
        const current = state.positions.find((p) => p.id === id);
        const qty = Number(sellQuantity);
        const hasQty = Number.isFinite(qty) && qty > 0;

        if (!current) {
          if (isAuthenticated && hasQty) {
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
          dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Portfolio', 'Posición no encontrada para vender.') });
          return;
        }

        if (current.sellDate) return;
        const currentQty = Number(current.quantity);
        const isValidQty = hasQty && qty <= currentQty;
        if (!isValidQty) {
          dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Portfolio', 'Cantidad de venta inválida.') });
          return;
        }

        const isFullSell = qty === currentQty;
        if (isAuthenticated) {
          try {
            if (isFullSell) {
              const out = await api.updatePosition(id, { sellPrice, sellDate });
              const updated = normalizePosition(out);
              dispatch({ type: 'SET_POSITIONS', payload: state.positions.map((p) => (p.id === id ? updated : p)) });
              return;
            }

            const soldLot = await api.addPosition({
              symbol: current.symbol,
              name: current.name,
              category: current.category,
              buyDate: current.buyDate,
              buyPrice: Number(current.buyPrice),
              quantity: qty,
              notes: current.notes || ''
            });
            const soldLotClosed = await api.updatePosition(soldLot.id, { sellPrice, sellDate });
            const remainingQty = Number((currentQty - qty).toFixed(8));
            const updatedCurrent = await api.updatePosition(id, { quantity: remainingQty });

            const soldNormalized = normalizePosition(soldLotClosed);
            const currentNormalized = normalizePosition(updatedCurrent);
            dispatch({
              type: 'SET_POSITIONS',
              payload: [soldNormalized, ...state.positions.map((p) => (p.id === id ? currentNormalized : p))]
            });
            return;
          } catch {
            dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Portfolio', 'No se pudo vender la posición.') });
            return;
          }
        }

        const next = isFullSell
          ? state.positions.map((p) => (p.id === id ? { ...p, sellPrice, sellDate } : p))
          : [
              {
                ...current,
                id: crypto.randomUUID(),
                quantity: qty,
                sellPrice,
                sellDate
              },
              ...state.positions.map((p) =>
                p.id === id ? { ...p, quantity: Number((currentQty - qty).toFixed(8)) } : p
              )
            ];
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
      addToWatchlist: async (entry) => {
        const normalizedSymbol = String(typeof entry === 'string' ? entry : entry?.symbol || '')
          .trim()
          .toUpperCase();
        if (!normalizedSymbol || state.watchlistSymbols.includes(normalizedSymbol)) return;

        const fallbackMeta = WATCHLIST_CATALOG.find((x) => x.symbol === normalizedSymbol) || null;
        const providedMeta =
          typeof entry === 'object' && entry
            ? {
                symbol: normalizedSymbol,
                name: String(entry.name || normalizedSymbol),
                category: String(entry.category || fallbackMeta?.category || 'equity').toLowerCase(),
                sector: String(entry.sector || fallbackMeta?.sector || 'general').toLowerCase(),
                source: String(entry.source || fallbackMeta?.source || (normalizedSymbol.endsWith('USDT')
                  ? 'finnhub_crypto'
                  : normalizedSymbol.includes('_')
                    ? 'finnhub_fx'
                    : 'finnhub_stock'))
              }
            : null;
        const meta = providedMeta || fallbackMeta;
        if (!meta) {
          dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Watchlist', `Activo no disponible para agregar: ${normalizedSymbol}.`) });
          return;
        }

        const nextWatchlist = [...state.watchlistSymbols, normalizedSymbol];

        if (isAuthenticated) {
          try {
            const type = meta.category === 'crypto' ? 'crypto' : meta.category === 'fx' ? 'forex' : 'stock';
            await api.addToWatchlist({ symbol: meta.symbol, name: meta.name, type, category: meta.category });
          } catch {
            dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Watchlist', `No se pudo agregar ${normalizedSymbol} en backend.`) });
            return;
          }
        } else {
          saveWatchlistSymbols(nextWatchlist);
        }

        dispatch({ type: 'SET_WATCHLIST', payload: nextWatchlist });

        const data = isAuthenticated ? await fetchSnapshotViaProxy(meta) : await fetchAssetSnapshot(meta);
        if (!(data?.quote && data?.candles?.c?.length)) {
          dispatch({ type: 'PUSH_UI_ERROR', payload: makeUiError('Watchlist', `No se pudo agregar ${normalizedSymbol}.`) });
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
