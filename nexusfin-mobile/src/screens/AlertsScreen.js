import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, getApiBase, getToken } from '../api/client';
import { getThemePalette } from '../theme/palette';
import { typography } from '../theme/typography';
import EmptyState from '../components/EmptyState';
import FadeInView from '../components/FadeInView';

const MAIN_TABS = ['live', 'history', 'performance'];
const HISTORY_TYPES = ['all', 'opportunity', 'bearish', 'stop_loss'];
const OUTCOME_TYPES = ['all', 'win', 'loss', 'open'];

const MAIN_LABEL = { live: 'En vivo', history: 'Historial', performance: 'Performance' };
const HISTORY_LABEL = { all: 'Todos', opportunity: 'Compra', bearish: 'Venta', stop_loss: 'Stop Loss' };
const OUTCOME_LABEL = { all: 'Todos', win: 'Win', loss: 'Loss', open: 'Open' };
const WS_STATUS_LABEL = {
  connecting: 'conectando',
  reconnecting: 'reconectando',
  connected: 'conectado',
  disconnected: 'desconectado',
  error: 'error'
};
const SKELETON_ROWS = [1, 2, 3, 4];

const formatPct = (n, { signed = false } = {}) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return '--';
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const toLiveAlert = (incoming) => ({
  id: incoming.id || `ws-${Date.now()}`,
  symbol: incoming.symbol || '',
  recommendation: incoming.recommendation || 'ALERTA',
  type: incoming.type || 'unknown',
  confidence: incoming.confidence || 'high'
});

const getWsStatusTone = (status, palette) => {
  if (status === 'connected') return { backgroundColor: `${palette.positive}22`, color: palette.positive, borderColor: `${palette.positive}66` };
  if (status === 'connecting' || status === 'reconnecting') return { backgroundColor: `${palette.info}22`, color: palette.info, borderColor: `${palette.info}66` };
  return { backgroundColor: `${palette.warning}22`, color: palette.warning, borderColor: `${palette.warning}66` };
};

const AlertRow = ({ item, palette }) => (
  <FadeInView delay={20}>
    <View style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View>
        <Text style={[styles.symbol, { color: palette.text }]}>{item.symbol}</Text>
        <Text style={[styles.meta, { color: palette.muted }]}>Confianza: {item.confidence || 'high'}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.recommendation, { color: palette.text }]}>{item.recommendation || 'SEÑAL'}</Text>
        <Text style={[styles.badge, { color: palette.info }]}>{item.type || 'unknown'}</Text>
      </View>
    </View>
  </FadeInView>
);

const AlertsScreen = ({ theme = 'dark' }) => {
  const palette = getThemePalette(theme);

  const [tab, setTab] = useState('live');
  const [historyType, setHistoryType] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  const [liveAlerts, setLiveAlerts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [shareGroupId, setShareGroupId] = useState('');
  const [shareLoadingId, setShareLoadingId] = useState('');
  const [historyData, setHistoryData] = useState({
    alerts: [],
    pagination: { page: 1, pages: 1, total: 0, limit: 20 },
    stats: { total: 0, opportunities: 0, bearish: 0, stopLoss: 0, hitRate: 0, avgReturn: 0 }
  });

  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const wsTone = getWsStatusTone(wsStatus, palette);

  const performanceAlerts = useMemo(
    () => (historyData.alerts || []).filter((a) => outcomeFilter === 'all' || (a.outcome || 'open') === outcomeFilter),
    [historyData.alerts, outcomeFilter]
  );

  const loadLive = async () => {
    const out = await api.getAlerts({ page: 1, limit: 20 });
    return out?.alerts || [];
  };

  const loadHistory = async ({ page = historyPage, type = historyType } = {}) => {
    setHistoryLoading(true);
    try {
      const out = await api.getAlerts({ page, limit: 20, type: type === 'all' ? null : type });
      setHistoryData({
        alerts: out?.alerts || [],
        pagination: out?.pagination || { page: 1, pages: 1, total: 0, limit: 20 },
        stats: out?.stats || { total: 0, opportunities: 0, bearish: 0, stopLoss: 0, hitRate: 0, avgReturn: 0 }
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      if (tab === 'live') {
        const next = await loadLive();
        setLiveAlerts(next.map(toLiveAlert));
      } else {
        await loadHistory({ page: historyPage, type: historyType });
      }
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
      };
      ws.onerror = () => setWsStatus('error');
      ws.onclose = () => {
        setWsStatus('disconnected');
        if (!stopped) reconnectTimer = setTimeout(connectWs, nextReconnectDelay());
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}'));
          if (payload.type !== 'alert' || !payload.alert) return;
          const mapped = toLiveAlert(payload.alert);
          setLiveAlerts((prev) => {
            const exists = prev.some((a) => a.id === mapped.id);
            if (exists) return prev;
            return [mapped, ...prev].slice(0, 40);
          });
        } catch {
          // ignore malformed ws payload
        }
      };
    };

    api
      .getAlerts({ page: 1, limit: 20 })
      .then((out) => {
        if (!active) return;
        setLiveAlerts((out?.alerts || []).map(toLiveAlert));
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

  useEffect(() => {
    let active = true;
    api
      .getGroups()
      .then((out) => {
        if (!active) return;
        const next = out?.groups || [];
        setGroups(next);
        if (!shareGroupId && next[0]?.id) setShareGroupId(next[0].id);
      })
      .catch(() => {
        if (!active) return;
        setGroups([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const shareAlert = async (alertId) => {
    if (!alertId || !shareGroupId) return;
    setShareLoadingId(alertId);
    setError('');
    try {
      await api.shareAlertToGroup(alertId, { groupId: shareGroupId });
    } catch (e) {
      setError(e?.message || 'No se pudo compartir alerta.');
    } finally {
      setShareLoadingId('');
    }
  };

  useEffect(() => {
    if (tab === 'live') return;
    setError('');
    loadHistory({ page: historyPage, type: historyType }).catch(() => setError('No se pudieron cargar alertas.'));
  }, [tab, historyPage, historyType]);

  const renderLive = () => (
    <FlatList
      data={liveAlerts}
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListEmptyComponent={<EmptyState palette={palette} title="Sin alertas en vivo" subtitle="Cuando lleguen señales nuevas, aparecerán acá." />}
      renderItem={({ item }) => <AlertRow item={item} palette={palette} />}
    />
  );

  const renderHistory = () => (
    <>
      <View style={styles.rowWrap}>
        {HISTORY_TYPES.map((item) => (
          <Pressable
            key={item}
            onPress={() => {
              setHistoryType(item);
              setHistoryPage(1);
            }}
            style={[styles.chip, { borderColor: palette.border, backgroundColor: palette.surface }, historyType === item ? [styles.chipActive, { borderColor: palette.primary }] : null]}
          >
            <Text style={[styles.chipLabel, { color: palette.muted }, historyType === item ? { color: palette.primary } : null]}>{HISTORY_LABEL[item]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.rowWrap}>
        {groups.map((group) => (
          <Pressable
            key={group.id}
            onPress={() => setShareGroupId(group.id)}
            style={[styles.chip, { borderColor: palette.border, backgroundColor: palette.surface }, shareGroupId === group.id ? [styles.chipActive, { borderColor: palette.primary }] : null]}
          >
            <Text style={[styles.chipLabel, { color: palette.muted }, shareGroupId === group.id ? { color: palette.primary } : null]}>
              {group.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={historyData.alerts || []}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={!historyLoading ? <EmptyState palette={palette} title="Sin historial" subtitle="Todavía no hay alertas para este filtro." /> : null}
        renderItem={({ item }) => (
          <View>
            <AlertRow item={item} palette={palette} />
            <View style={styles.shareRow}>
              <Pressable
                style={[styles.shareBtn, { backgroundColor: palette.secondaryButton, borderColor: palette.border }]}
                onPress={() => shareAlert(item.id)}
                disabled={!shareGroupId || shareLoadingId === item.id}
                accessibilityRole="button"
                accessibilityLabel={`Compartir alerta ${item.symbol || ''}`}
                hitSlop={8}
              >
                <Text style={{ color: palette.text, fontWeight: '700' }}>
                  {shareLoadingId === item.id ? 'Compartiendo...' : shareGroupId ? 'Compartir al grupo seleccionado' : 'Sin grupo'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <View style={styles.pagination}>
        <Pressable
          style={[styles.pageBtn, { backgroundColor: palette.secondaryButton }]}
          disabled={historyData.pagination.page <= 1 || historyLoading}
          onPress={() => setHistoryPage((p) => Math.max(1, p - 1))}
        >
          <Text style={{ color: palette.text }}>Anterior</Text>
        </Pressable>
        <Text style={{ color: palette.muted }}>
          {historyData.pagination.page}/{historyData.pagination.pages}
        </Text>
        <Pressable
          style={[styles.pageBtn, { backgroundColor: palette.secondaryButton }]}
          disabled={historyData.pagination.page >= historyData.pagination.pages || historyLoading}
          onPress={() => setHistoryPage((p) => p + 1)}
        >
          <Text style={{ color: palette.text }}>Siguiente</Text>
        </Pressable>
      </View>
    </>
  );

  const renderPerformance = () => (
    <>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.statLabel, { color: palette.muted }]}>Hit Rate</Text>
          <Text style={[styles.statValue, { color: palette.text }]}>{formatPct((historyData.stats.hitRate || 0) * 100, { signed: true })}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.statLabel, { color: palette.muted }]}>Avg Return</Text>
          <Text style={[styles.statValue, { color: palette.text }]}>{formatPct(historyData.stats.avgReturn || 0, { signed: true })}</Text>
        </View>
      </View>

      <View style={styles.rowWrap}>
        {OUTCOME_TYPES.map((item) => (
          <Pressable
            key={item}
            onPress={() => setOutcomeFilter(item)}
            style={[styles.chip, { borderColor: palette.border, backgroundColor: palette.surface }, outcomeFilter === item ? [styles.chipActive, { borderColor: palette.primary }] : null]}
          >
            <Text style={[styles.chipLabel, { color: palette.muted }, outcomeFilter === item ? { color: palette.primary } : null]}>{OUTCOME_LABEL[item]}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={performanceAlerts}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<EmptyState palette={palette} title="Sin resultados" subtitle="No hay alertas de performance para este filtro." />}
        renderItem={({ item }) => <AlertRow item={item} palette={palette} />}
      />
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>Alertas</Text>
      <View style={[styles.wsBadge, { backgroundColor: wsTone.backgroundColor, borderColor: wsTone.borderColor }]}>
        <Text style={[styles.wsBadgeLabel, { color: wsTone.color }]}>Tiempo real: {WS_STATUS_LABEL[wsStatus] || wsStatus}</Text>
      </View>
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}

      <View style={styles.rowWrap}>
        {MAIN_TABS.map((item) => (
          <Pressable
            key={item}
            onPress={() => {
              setTab(item);
              if (item === 'history') setHistoryPage(1);
            }}
            style={[styles.chip, { borderColor: palette.border, backgroundColor: palette.surface }, tab === item ? [styles.chipActive, { borderColor: palette.primary }] : null]}
          >
            <Text style={[styles.chipLabel, { color: palette.muted }, tab === item ? { color: palette.primary } : null]}>{MAIN_LABEL[item]}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'live' && refreshing ? (
        <View style={styles.skeletonWrap}>
          {SKELETON_ROWS.map((item) => (
            <View key={item} style={[styles.skeletonRow, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View>
                <View style={[styles.skeletonLineMd, { backgroundColor: palette.surfaceAlt }]} />
                <View style={[styles.skeletonLineSm, { backgroundColor: palette.surfaceAlt }]} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <View style={[styles.skeletonLineLg, { backgroundColor: palette.surfaceAlt }]} />
                <View style={[styles.skeletonLineSm, { backgroundColor: palette.surfaceAlt, width: 70 }]} />
              </View>
            </View>
          ))}
          <View style={[styles.loadingCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <ActivityIndicator color={palette.primary} />
            <Text style={[styles.loadingText, { color: palette.muted }]}>Actualizando alertas...</Text>
          </View>
        </View>
      ) : null}

      {tab === 'live' ? renderLive() : null}
      {tab === 'history' ? renderHistory() : null}
      {tab === 'performance' ? renderPerformance() : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { ...typography.screenTitle, marginBottom: 4 },
  wsBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  wsBadgeLabel: { ...typography.caption, textTransform: 'uppercase' },
  muted: { ...typography.body, marginBottom: 8 },
  error: { ...typography.body, marginBottom: 10 },
  skeletonWrap: { marginBottom: 8 },
  skeletonRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  skeletonLineLg: { width: 80, height: 12, borderRadius: 6 },
  skeletonLineMd: { width: 60, height: 12, borderRadius: 6 },
  skeletonLineSm: { width: 100, height: 10, borderRadius: 6, marginTop: 8 },
  loadingCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  loadingText: { ...typography.body },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  chipActive: {},
  chipLabel: { ...typography.chipLabel },
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
  recommendation: { ...typography.bodyStrong },
  meta: { ...typography.body, marginTop: 2 },
  badge: { ...typography.caption, marginTop: 3 },
  right: { alignItems: 'flex-end' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10
  },
  statLabel: { ...typography.caption },
  statValue: { ...typography.screenTitle, fontSize: 20, marginTop: 4 },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  pageBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  shareRow: {
    marginTop: -4,
    marginBottom: 10
  },
  shareBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center'
  }
});

export default AlertsScreen;
