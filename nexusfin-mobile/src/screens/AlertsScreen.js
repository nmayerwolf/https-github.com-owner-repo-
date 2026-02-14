import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { api, getApiBase, getToken } from '../api/client';
import { getThemePalette } from '../theme/palette';

const AlertsScreen = ({ theme = 'dark' }) => {
  const palette = getThemePalette(theme);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [wsStatus, setWsStatus] = useState('disconnected');

  const loadAlerts = async () => {
    const out = await api.getAlerts();
    return out?.alerts || [];
  };

  const refreshAlerts = async () => {
    setRefreshing(true);
    setError('');
    try {
      const next = await loadAlerts();
      setAlerts(next);
    } catch {
      setError('No se pudieron cargar alertas.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
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

      ws.onopen = () => setWsStatus('connected');
      ws.onerror = () => setWsStatus('error');
      ws.onclose = () => {
        setWsStatus('disconnected');
        if (!stopped) reconnectTimer = setTimeout(connectWs, 5000);
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}'));
          if (payload.type !== 'alert' || !payload.alert) return;

          const incoming = payload.alert;
          const mapped = {
            id: incoming.id || `ws-${Date.now()}`,
            symbol: incoming.symbol || '',
            recommendation: incoming.recommendation || 'ALERTA',
            type: incoming.type || 'unknown'
          };

          setAlerts((prev) => {
            const exists = prev.some((a) => a.id === mapped.id);
            if (exists) return prev;
            return [mapped, ...prev];
          });
        } catch {
          // ignore malformed ws payload
        }
      };
    };

    api
      .getAlerts()
      .then((out) => {
        if (!active) return;
        setAlerts(out?.alerts || []);
        connectWs();
      })
      .catch(() => {
        if (!active) return;
        setError('No se pudieron cargar alertas.');
        connectWs();
      });

    return () => {
      active = false;
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        // no-op
      }
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>Alertas</Text>
      <Text style={[styles.muted, { color: palette.muted }]}>WS: {wsStatus}</Text>
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={refreshAlerts}
        ListEmptyComponent={<Text style={[styles.muted, { color: palette.muted }]}>Sin alertas disponibles.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.symbol, { color: palette.text }]}>{item.symbol}</Text>
            <Text style={[styles.meta, { color: palette.muted }]}>
              {item.recommendation} • {item.type}
            </Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  row: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8
  },
  symbol: { fontWeight: '700' },
  meta: { marginTop: 2 },
  muted: {},
  error: { marginBottom: 10 }
});

export default AlertsScreen;
