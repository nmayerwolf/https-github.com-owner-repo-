import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, getApiBase, getToken } from '../api/client';
import { MARKET_CATEGORIES, MOBILE_MARKET_UNIVERSE } from '../constants/markets';
import { getThemePalette } from '../theme/palette';
import { typography } from '../theme/typography';
import EmptyState from '../components/EmptyState';
import FadeInView from '../components/FadeInView';

const toQuoteSymbol = (asset) => asset.wsSymbol;
const WATCHLIST_FILTER = 'watchlist';
const WS_STATUS_LABEL = {
  connecting: 'conectando',
  reconnecting: 'reconectando',
  connected: 'conectado',
  disconnected: 'desconectado',
  error: 'error'
};
const SKELETON_ROWS = [1, 2, 3, 4, 5];

const formatUsd = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: n > 100 ? 2 : 4 })}`;
};

const formatPct = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
};

const MarketsScreen = ({ theme = 'dark' }) => {
  const palette = getThemePalette(theme);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [universe, setUniverse] = useState(MOBILE_MARKET_UNIVERSE);
  const [watchlistSymbols, setWatchlistSymbols] = useState([]);
  const [watchlistItems, setWatchlistItems] = useState([]);
  const [watchlistBusySymbol, setWatchlistBusySymbol] = useState('');
  const [rows, setRows] = useState(() =>
    MOBILE_MARKET_UNIVERSE.map((asset) => ({ ...asset, price: null, changePercent: null, updatedAt: null }))
  );
  const knownSymbols = useMemo(() => new Set(rows.map((asset) => String(asset.symbol || '').toUpperCase())), [rows]);
  const tabs = useMemo(() => {
    const categorySet = new Set(universe.map((asset) => asset.category).filter(Boolean));
    const ordered = MARKET_CATEGORIES.filter((item) => item === 'all' || categorySet.has(item));
    for (const item of categorySet) {
      if (!ordered.includes(item)) ordered.push(item);
    }
    return [...ordered, WATCHLIST_FILTER];
  }, [universe]);

  const loadUniverse = async () => {
    try {
      const out = await api.getMarketUniverse();
      const assets = Array.isArray(out?.assets) ? out.assets : [];
      if (!assets.length) return;
      setUniverse(assets);
      setRows((prev) => {
        const byId = new Map(prev.map((item) => [item.id, item]));
        return assets.map((asset) => {
          const existing = byId.get(asset.id);
          return {
            ...asset,
            price: existing?.price ?? null,
            changePercent: existing?.changePercent ?? null,
            updatedAt: existing?.updatedAt ?? null
          };
        });
      });
    } catch {
      // keep local fallback universe
    }
  };

  const visible = useMemo(
    () =>
      rows.filter((asset) => {
        if (category === 'all') return true;
        if (category === WATCHLIST_FILTER) return watchlistSymbols.includes(String(asset.symbol || '').toUpperCase());
        return asset.category === category;
      }),
    [rows, category, watchlistSymbols]
  );

  const externalWatchlistItems = useMemo(
    () => watchlistItems.filter((item) => !knownSymbols.has(String(item.symbol || '').toUpperCase())),
    [watchlistItems, knownSymbols]
  );
  const lastUpdatedAt = useMemo(() => {
    const values = rows.map((item) => Number(item.updatedAt)).filter((v) => Number.isFinite(v));
    if (!values.length) return null;
    return new Date(Math.max(...values));
  }, [rows]);

  const refreshQuotes = async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    setError('');

    try {
      const updates = await Promise.all(
        universe.map(async (asset) => {
          try {
            const quote = await api.quote(toQuoteSymbol(asset));
            const price = Number(quote?.c);
            const changePercent = Number(quote?.dp);
            if (!Number.isFinite(price) || price <= 0) return null;
            return {
              id: asset.id,
              price,
              changePercent: Number.isFinite(changePercent) ? changePercent : null,
              updatedAt: Date.now()
            };
          } catch {
            return null;
          }
        })
      );

      const byId = Object.fromEntries(updates.filter(Boolean).map((u) => [u.id, u]));
      setRows((prev) => prev.map((asset) => (byId[asset.id] ? { ...asset, ...byId[asset.id] } : asset)));
    } catch {
      setError('No se pudieron cargar cotizaciones.');
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  };

  const loadWatchlist = async () => {
    try {
      const out = await api.getWatchlist();
      const rawItems = Array.isArray(out?.symbols) ? out.symbols : [];
      const symbols = rawItems.map((item) => String(item.symbol || '').toUpperCase()).filter(Boolean);
      setWatchlistSymbols(symbols);
      setWatchlistItems(rawItems);
    } catch {
      setWatchlistSymbols([]);
      setWatchlistItems([]);
    }
  };

  const removeWatchlistSymbol = async (symbol) => {
    if (!symbol) return;

    setWatchlistBusySymbol(symbol);
    setMessage('');
    setError('');

    try {
      await api.removeFromWatchlist(symbol);
      setWatchlistSymbols((prev) => prev.filter((item) => item !== symbol));
      setWatchlistItems((prev) => prev.filter((item) => String(item.symbol || '').toUpperCase() !== symbol));
      setMessage(`${symbol} removido de watchlist.`);
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar watchlist.');
    } finally {
      setWatchlistBusySymbol('');
    }
  };

  const toggleWatchlist = async (asset) => {
    const symbol = String(asset?.symbol || '').toUpperCase();
    if (!symbol) return;

    const exists = watchlistSymbols.includes(symbol);
    if (exists) {
      await removeWatchlistSymbol(symbol);
      return;
    }

    setWatchlistBusySymbol(symbol);
    setMessage('');
    setError('');

    try {
      await api.addToWatchlist({
        symbol,
        name: asset.name,
        type: asset.category,
        category: asset.category
      });
      const created = {
        symbol,
        name: asset.name,
        type: asset.category,
        category: asset.category
      };
      setWatchlistSymbols((prev) => [symbol, ...prev.filter((item) => item !== symbol)]);
      setWatchlistItems((prev) => [created, ...prev.filter((item) => String(item.symbol || '').toUpperCase() !== symbol)]);
      setMessage(`${symbol} agregado a watchlist.`);
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar watchlist.');
    } finally {
      setWatchlistBusySymbol('');
    }
  };

  useEffect(() => {
    loadUniverse();
    loadWatchlist();
  }, []);

  useEffect(() => {
    refreshQuotes();
  }, [universe]);

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let stopped = false;
    let hadOpen = false;
    let reconnectAttempt = 0;

    const nextReconnectDelay = () => {
      const base = hadOpen ? 2000 : 1200;
      const expo = Math.min(20000, base * 2 ** reconnectAttempt);
      const jitter = Math.floor(Math.random() * 700);
      reconnectAttempt += 1;
      return expo + jitter;
    };

    const connectWs = () => {
      const token = getToken();
      if (!token) {
        setWsStatus('error');
        return;
      }
      setWsStatus(hadOpen ? 'reconnecting' : 'connecting');

      const apiBase = getApiBase();
      const parsed = new URL(apiBase);
      const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsPath = parsed.pathname.replace(/\/api\/?$/, '');
      const url = `${wsProtocol}//${parsed.host}${wsPath}/ws?token=${encodeURIComponent(token)}`;

      ws = new WebSocket(url);
      ws.onopen = () => {
        hadOpen = true;
        reconnectAttempt = 0;
        setWsStatus('connected');
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            symbols: universe.map((asset) => asset.wsSymbol)
          })
        );
      };
      ws.onerror = () => setWsStatus('error');
      ws.onclose = () => {
        setWsStatus('disconnected');
        if (!stopped) reconnectTimer = setTimeout(connectWs, nextReconnectDelay());
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}'));
          if (payload?.type !== 'price' || !payload?.symbol) return;

          const incomingSymbol = String(payload.symbol).toUpperCase();
          const nextPrice = Number(payload.price);
          const nextChange = Number(payload.change);
          if (!Number.isFinite(nextPrice) || nextPrice <= 0) return;

          setRows((prev) =>
            prev.map((asset) =>
              asset.wsSymbol === incomingSymbol
                ? {
                    ...asset,
                    price: nextPrice,
                    changePercent: Number.isFinite(nextChange) ? nextChange : asset.changePercent,
                    updatedAt: Date.now()
                  }
                : asset
            )
          );
        } catch {
          // ignore malformed websocket payload
        }
      };
    };

    connectWs();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        // no-op
      }
    };
  }, [universe]);

  useEffect(() => {
    const id = setInterval(() => {
      refreshQuotes({ silent: true });
    }, 30000);
    return () => clearInterval(id);
  }, [universe]);

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>Mercados</Text>
      <Text style={[styles.muted, { color: palette.muted }]}>Tiempo real: {WS_STATUS_LABEL[wsStatus] || wsStatus}</Text>
      <Text style={[styles.muted, { color: palette.muted }]}>Watchlist: {watchlistSymbols.length} símbolos</Text>
      {lastUpdatedAt ? (
        <Text style={[styles.muted, { color: palette.muted }]}>
          Última actualización: {lastUpdatedAt.toLocaleTimeString('es-AR')}
        </Text>
      ) : null}
      {message ? <Text style={[styles.message, { color: palette.info }]}>{message}</Text> : null}
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}

      <View style={styles.chips}>
        {tabs.map((item) => (
          <Pressable
            key={item}
            onPress={() => setCategory(item)}
            style={[styles.chip, { borderColor: palette.border, backgroundColor: palette.surface }, category === item ? [styles.chipActive, { borderColor: palette.primary }] : null]}
          >
            <Text style={[styles.chipLabel, { color: palette.muted }, category === item ? [styles.chipLabelActive, { color: palette.primary }] : null]}>
              {item === WATCHLIST_FILTER ? 'WATCHLIST' : item.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.skeletonWrap}>
          {SKELETON_ROWS.map((item) => (
            <View key={item} style={[styles.skeletonRow, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={styles.skeletonLeft}>
                <View style={[styles.skeletonLineLg, { backgroundColor: palette.surfaceAlt }]} />
                <View style={[styles.skeletonLineSm, { backgroundColor: palette.surfaceAlt }]} />
              </View>
              <View style={styles.skeletonRight}>
                <View style={[styles.skeletonLineMd, { backgroundColor: palette.surfaceAlt }]} />
                <View style={[styles.skeletonLineSm, { backgroundColor: palette.surfaceAlt, marginTop: 6 }]} />
              </View>
            </View>
          ))}
          <View style={[styles.loadingCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <ActivityIndicator color={palette.primary} />
            <Text style={[styles.loadingText, { color: palette.muted }]}>Cargando activos del mercado...</Text>
          </View>
        </View>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={() => refreshQuotes()}
        ListEmptyComponent={!loading ? <EmptyState palette={palette} title="Sin activos" subtitle="Probá otro filtro o actualizá la lista." /> : null}
        renderItem={({ item }) => {
          const isUp = Number(item.changePercent) >= 0;
          const inWatchlist = watchlistSymbols.includes(String(item.symbol || '').toUpperCase());
          const isBusy = watchlistBusySymbol === String(item.symbol || '').toUpperCase();
          return (
            <FadeInView delay={20}>
              <View style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.symbol, { color: palette.text }]}>{item.symbol}</Text>
                  <Text style={[styles.meta, { color: palette.muted }]}>{item.name}</Text>
                </View>
                <View style={styles.right}>
                  <Text style={[styles.price, { color: palette.text }]}>{formatUsd(item.price)}</Text>
                  <Text style={[styles.change, { color: isUp ? palette.positive : palette.negative }]}>{formatPct(item.changePercent)}</Text>
                  <Pressable
                    onPress={() => toggleWatchlist(item)}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`${inWatchlist ? 'Quitar' : 'Agregar'} ${item.symbol} de watchlist`}
                    hitSlop={8}
                    style={[
                      styles.watchButton,
                      inWatchlist
                        ? [styles.watchButtonOn, { backgroundColor: palette.surfaceAlt, borderColor: palette.primary }]
                        : [styles.watchButtonOff, { backgroundColor: palette.secondaryButton, borderColor: palette.border }]
                    ]}
                  >
                    <Text style={[styles.watchButtonLabel, { color: palette.text }]}>
                      {isBusy ? '...' : inWatchlist ? 'Quitar' : 'Agregar'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </FadeInView>
          );
        }}
        ListFooterComponent={
          externalWatchlistItems.length ? (
            <View style={[styles.externalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.externalTitle, { color: palette.text }]}>Watchlist backend (fuera de universo mobile)</Text>
              {externalWatchlistItems.map((item) => {
                const symbol = String(item.symbol || '').toUpperCase();
                const isBusy = watchlistBusySymbol === symbol;
                return (
                  <View key={symbol} style={styles.externalRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.symbol, { color: palette.text }]}>{symbol}</Text>
                      <Text style={[styles.meta, { color: palette.muted }]}>{item.name || item.category || 'Activo'}</Text>
                    </View>
                    <Pressable
                      onPress={() => removeWatchlistSymbol(symbol)}
                      disabled={isBusy}
                      style={[styles.watchButton, styles.watchButtonOn, { backgroundColor: palette.surfaceAlt, borderColor: palette.primary, marginTop: 0 }]}
                    >
                      <Text style={[styles.watchButtonLabel, { color: palette.text }]}>{isBusy ? '...' : 'Quitar'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { ...typography.screenTitle, marginBottom: 6 },
  muted: { ...typography.body, marginBottom: 8 },
  error: { ...typography.body, marginBottom: 8 },
  message: { ...typography.body, marginBottom: 8 },
  skeletonWrap: { marginBottom: 8 },
  skeletonRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  skeletonLeft: { flex: 1 },
  skeletonRight: { alignItems: 'flex-end' },
  skeletonLineLg: { width: 90, height: 12, borderRadius: 6 },
  skeletonLineMd: { width: 70, height: 12, borderRadius: 6 },
  skeletonLineSm: { width: 120, height: 10, borderRadius: 6, marginTop: 8 },
  loadingCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  loadingText: { ...typography.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'transparent'
  },
  chipActive: {},
  chipLabel: { ...typography.chipLabel },
  chipLabelActive: {},
  row: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  symbol: { ...typography.bodyStrong },
  meta: { ...typography.body, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  price: { ...typography.number },
  change: { ...typography.number, marginTop: 2 },
  positive: {},
  negative: {},
  watchButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
    borderWidth: 1
  },
  watchButtonOn: {},
  watchButtonOff: {},
  watchButtonLabel: {
    ...typography.buttonLabel,
    fontSize: 12
  },
  externalCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12
  },
  externalTitle: {
    ...typography.bodyStrong,
    marginBottom: 8
  },
  externalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6
  }
});

export default MarketsScreen;
