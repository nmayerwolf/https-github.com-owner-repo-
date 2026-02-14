import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, getApiBase, getToken } from '../api/client';
import { MARKET_CATEGORIES, MOBILE_MARKET_UNIVERSE } from '../constants/markets';

const toQuoteSymbol = (asset) => asset.wsSymbol;

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

const MarketsScreen = () => {
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [watchlistSymbols, setWatchlistSymbols] = useState([]);
  const [watchlistLoadingId, setWatchlistLoadingId] = useState('');
  const [rows, setRows] = useState(() =>
    MOBILE_MARKET_UNIVERSE.map((asset) => ({ ...asset, price: null, changePercent: null, updatedAt: null }))
  );

  const visible = useMemo(
    () => rows.filter((asset) => category === 'all' || asset.category === category),
    [rows, category]
  );

  const refreshQuotes = async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    setError('');

    try {
      const updates = await Promise.all(
        MOBILE_MARKET_UNIVERSE.map(async (asset) => {
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
      const symbols = (out?.symbols || []).map((item) => String(item.symbol || '').toUpperCase()).filter(Boolean);
      setWatchlistSymbols(symbols);
    } catch {
      setWatchlistSymbols([]);
    }
  };

  const toggleWatchlist = async (asset) => {
    const symbol = String(asset?.symbol || '').toUpperCase();
    if (!symbol) return;

    setWatchlistLoadingId(asset.id);
    setMessage('');
    setError('');

    try {
      const exists = watchlistSymbols.includes(symbol);
      if (exists) {
        await api.removeFromWatchlist(symbol);
        setWatchlistSymbols((prev) => prev.filter((item) => item !== symbol));
        setMessage(`${symbol} removido de watchlist.`);
      } else {
        await api.addToWatchlist({
          symbol,
          name: asset.name,
          type: asset.category,
          category: asset.category
        });
        setWatchlistSymbols((prev) => [symbol, ...prev.filter((item) => item !== symbol)]);
        setMessage(`${symbol} agregado a watchlist.`);
      }
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar watchlist.');
    } finally {
      setWatchlistLoadingId('');
    }
  };

  useEffect(() => {
    refreshQuotes();
    loadWatchlist();
  }, []);

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let stopped = false;

    const connectWs = () => {
      const token = getToken();
      if (!token) {
        setWsStatus('error');
        return;
      }

      const apiBase = getApiBase();
      const parsed = new URL(apiBase);
      const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsPath = parsed.pathname.replace(/\/api\/?$/, '');
      const url = `${wsProtocol}//${parsed.host}${wsPath}/ws?token=${encodeURIComponent(token)}`;

      ws = new WebSocket(url);
      ws.onopen = () => {
        setWsStatus('connected');
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            symbols: MOBILE_MARKET_UNIVERSE.map((asset) => asset.wsSymbol)
          })
        );
      };
      ws.onerror = () => setWsStatus('error');
      ws.onclose = () => {
        setWsStatus('disconnected');
        if (!stopped) reconnectTimer = setTimeout(connectWs, 5000);
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
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      refreshQuotes({ silent: true });
    }, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Markets</Text>
      <Text style={styles.muted}>WS: {wsStatus}</Text>
      <Text style={styles.muted}>Watchlist: {watchlistSymbols.length} símbolos</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.chips}>
        {MARKET_CATEGORIES.map((item) => (
          <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item ? styles.chipActive : null]}>
            <Text style={[styles.chipLabel, category === item ? styles.chipLabelActive : null]}>{item.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={() => refreshQuotes()}
        ListEmptyComponent={!loading ? <Text style={styles.muted}>Sin activos para este filtro.</Text> : null}
        renderItem={({ item }) => {
          const isUp = Number(item.changePercent) >= 0;
          const inWatchlist = watchlistSymbols.includes(String(item.symbol || '').toUpperCase());
          return (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.symbol}>{item.symbol}</Text>
                <Text style={styles.meta}>{item.name}</Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.price}>{formatUsd(item.price)}</Text>
                <Text style={[styles.change, isUp ? styles.positive : styles.negative]}>{formatPct(item.changePercent)}</Text>
                <Pressable
                  onPress={() => toggleWatchlist(item)}
                  disabled={watchlistLoadingId === item.id}
                  style={[styles.watchButton, inWatchlist ? styles.watchButtonOn : styles.watchButtonOff]}
                >
                  <Text style={styles.watchButtonLabel}>
                    {watchlistLoadingId === item.id ? '...' : inWatchlist ? 'Quitar' : 'Agregar'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080F1E', padding: 16 },
  title: { color: '#E0E7F0', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  muted: { color: '#6B7B8D', marginBottom: 8 },
  error: { color: '#FF6B6B', marginBottom: 8 },
  message: { color: '#60A5FA', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    borderRadius: 999,
    borderColor: '#25324B',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0F1A2E'
  },
  chipActive: { borderColor: '#00E08E', backgroundColor: '#0B2A21' },
  chipLabel: { color: '#6B7B8D', fontSize: 11, fontWeight: '700' },
  chipLabelActive: { color: '#00E08E' },
  row: {
    backgroundColor: '#0F1A2E',
    borderColor: '#25324B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  symbol: { color: '#E0E7F0', fontWeight: '700' },
  meta: { color: '#6B7B8D', marginTop: 2 },
  right: { alignItems: 'flex-end' },
  price: { color: '#E0E7F0', fontWeight: '700' },
  change: { marginTop: 2, fontWeight: '700' },
  positive: { color: '#00E08E' },
  negative: { color: '#FF6B6B' },
  watchButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
    borderWidth: 1
  },
  watchButtonOn: {
    backgroundColor: '#112D24',
    borderColor: '#00E08E'
  },
  watchButtonOff: {
    backgroundColor: '#182740',
    borderColor: '#25324B'
  },
  watchButtonLabel: {
    color: '#E0E7F0',
    fontWeight: '700',
    fontSize: 12
  }
});

export default MarketsScreen;
