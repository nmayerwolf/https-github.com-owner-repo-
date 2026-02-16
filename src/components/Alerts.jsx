import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { fetchCompanyOverview } from '../api/alphavantage';
import { askClaude } from '../api/claude';
import { generateInvestmentThesis } from '../api/claude';
import { fetchCompanyProfile } from '../api/finnhub';
import { calculateConfluence } from '../engine/confluence';
import { useApp } from '../store/AppContext';
import { formatPct, formatUSD, shortDate } from '../utils/format';
import { ALERT_OUTCOMES, ALERT_TYPES } from '../../packages/nexusfin-core/contracts.js';
import AIThesis from './AIThesis';
import ConfluenceBar from './common/ConfluenceBar';
import Sparkline from './common/Sparkline';

const MAIN_TABS = ['live', 'history', 'performance'];
const LIVE_TABS = ['all', 'compra', 'venta', 'stoploss'];
const HISTORY_TYPE_TABS = ['all', ...ALERT_TYPES];
const OUTCOME_TABS = ['all', ...ALERT_OUTCOMES];

const MAIN_LABEL = {
  live: 'En vivo',
  history: 'Historial',
  performance: 'Rendimiento'
};

const HISTORY_TYPE_LABEL = {
  all: 'Todos',
  opportunity: 'Compra',
  bearish: 'Venta',
  stop_loss: 'Stop loss'
};

const OUTCOME_LABEL = {
  all: 'Todos',
  win: 'Ganada',
  loss: 'Perdida',
  open: 'Abierta'
};

const quickPrompts = ['Acciones oversold', 'Crypto momentum hoy', 'Mejores señales de compra', 'Riesgo en watchlist'];
const formatLargeNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return value || '-';
  return n.toLocaleString('en-US');
};

const buildLocalHint = (assets = [], query = '') => {
  const q = String(query || '').toLowerCase();
  if (!assets.length) return 'No hay activos cargados todavía.';
  if (q.includes('crypto')) {
    const rows = assets.filter((a) => a.category === 'crypto').slice(0, 4).map((a) => `${a.symbol}: ${formatPct(a.changePercent || 0)}`);
    return `Crypto destacadas:\n${rows.join('\n')}`;
  }
  const byChange = [...assets].sort((a, b) => Number(b.changePercent || 0) - Number(a.changePercent || 0)).slice(0, 4);
  return `Top movimiento:\n${byChange.map((a) => `${a.symbol}: ${formatPct(a.changePercent || 0)}`).join('\n')}`;
};

const Alerts = () => {
  const { state, actions } = useApp();

  const [mainTab, setMainTab] = useState('live');
  const [liveTab, setLiveTab] = useState('all');

  const [loadingId, setLoadingId] = useState('');
  const [thesis, setThesis] = useState(null);
  const [thesisSymbol, setThesisSymbol] = useState('');
  const [selectedLiveAlert, setSelectedLiveAlert] = useState(null);
  const [selectedFundamentals, setSelectedFundamentals] = useState({ loading: false, pe: '-', marketCap: '-' });

  const [historyType, setHistoryType] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit] = useState(20);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyData, setHistoryData] = useState({
    alerts: [],
    pagination: { page: 1, limit: 20, total: 0, pages: 1 },
    stats: { total: 0, opportunities: 0, bearish: 0, stopLoss: 0, hitRate: 0, avgReturn: 0 }
  });

  const [outcomeFilter, setOutcomeFilter] = useState('all');

  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [shareGroupByAlert, setShareGroupByAlert] = useState({});
  const [shareLoadingId, setShareLoadingId] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [exportLoadingId, setExportLoadingId] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [agentQuery, setAgentQuery] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const askAgentFn = typeof askClaude === 'function' ? askClaude : async () => ({ text: '' });

  const liveList = useMemo(() => state.alerts.filter((a) => liveTab === 'all' || a.type === liveTab), [liveTab, state.alerts]);
  const selectedAsset = useMemo(() => {
    const symbol = String(selectedLiveAlert?.symbol || '').toUpperCase();
    if (!symbol) return null;
    return (state.assets || []).find((item) => String(item.symbol || '').toUpperCase() === symbol) || null;
  }, [selectedLiveAlert, state.assets]);
  const selectedSeries = selectedAsset?.candles?.c?.slice(-45) || [];
  const trendStart = Number(selectedSeries?.[0]);
  const trendEnd = Number(selectedSeries?.[selectedSeries.length - 1]);
  const trendDeltaPct = Number.isFinite(trendStart) && trendStart !== 0 && Number.isFinite(trendEnd) ? ((trendEnd - trendStart) / trendStart) * 100 : null;

  const historyList = historyData.alerts || [];
  const performanceList = useMemo(
    () => historyList.filter((a) => outcomeFilter === 'all' || a.outcome === outcomeFilter),
    [historyList, outcomeFilter]
  );

  useEffect(() => {
    if (mainTab === 'live') return;

    let active = true;

    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError('');

      try {
        const type = historyType === 'all' ? null : historyType;
        const out = await api.getAlerts({ page: historyPage, limit: historyLimit, type });
        if (!active) return;
        setHistoryData(out);
      } catch {
        if (!active) return;
        setHistoryError('No se pudo cargar historial de alertas.');
      } finally {
        if (active) setHistoryLoading(false);
      }
    };

    fetchHistory();

    return () => {
      active = false;
    };
  }, [mainTab, historyType, historyPage, historyLimit]);

  useEffect(() => {
    if (mainTab === 'live') return;

    let active = true;

    const fetchGroups = async () => {
      if (typeof api.getGroups !== 'function') return;
      setGroupsLoading(true);
      try {
        const out = await api.getGroups();
        if (!active) return;
        setGroups(out.groups || []);
      } catch {
        if (!active) return;
        setGroups([]);
      } finally {
        if (active) setGroupsLoading(false);
      }
    };

    fetchGroups();

    return () => {
      active = false;
    };
  }, [mainTab]);

  useEffect(() => {
    let active = true;
    const symbol = String(selectedLiveAlert?.symbol || '').toUpperCase();
    if (!symbol || selectedAsset?.category !== 'equity') {
      setSelectedFundamentals({ loading: false, pe: '-', marketCap: '-' });
      return () => {
        active = false;
      };
    }

    setSelectedFundamentals({ loading: true, pe: '-', marketCap: '-' });
    Promise.all([fetchCompanyOverview(symbol), fetchCompanyProfile(symbol)])
      .then(([overview, profile]) => {
        if (!active) return;
        setSelectedFundamentals({
          loading: false,
          pe: overview?.PERatio || '-',
          marketCap: overview?.MarketCapitalization || profile?.marketCapitalization || '-'
        });
      })
      .catch(() => {
        if (!active) return;
        setSelectedFundamentals({ loading: false, pe: '-', marketCap: '-' });
      });

    return () => {
      active = false;
    };
  }, [selectedLiveAlert, selectedAsset?.category]);

  const openThesis = async (alert) => {
    const asset = actions.getAssetBySymbol(alert.symbol);
    if (!asset) return;

    setLoadingId(alert.id);
    try {
      const signal = calculateConfluence(asset, state.config);
      const out = await generateInvestmentThesis({ asset: { ...asset, signal }, config: state.config });
      setThesis(out.data);
      setThesisSymbol(alert.symbol);
    } finally {
      setLoadingId('');
    }
  };

  const askAgent = async (raw) => {
    const text = String(raw || '').trim();
    if (!text || agentLoading) return;
    setAgentLoading(true);
    setAgentQuery('');
    setChatMessages((prev) => [...prev, { role: 'user', text }]);
    try {
      const context = (state.assets || [])
        .slice(0, 16)
        .map((a) => `${a.symbol} price=${a.price} change=${a.changePercent} rsi=${a?.indicators?.rsi ?? 'n/a'}`)
        .join('\n');
      const out = await askAgentFn(`Consulta usuario: ${text}\n\nContexto de mercado:\n${context}`);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: out?.text || buildLocalHint(state.assets, text) }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', text: buildLocalHint(state.assets, text) }]);
    } finally {
      setAgentLoading(false);
    }
  };

  const shareAlertToGroup = async (alertId) => {
    if (typeof api.shareAlert !== 'function') return;
    const groupId = shareGroupByAlert[alertId];
    if (!groupId) {
      setShareMessage('Seleccioná un grupo para compartir la señal.');
      return;
    }

    setShareLoadingId(alertId);
    setShareMessage('');

    try {
      await api.shareAlert(alertId, groupId);
      setShareMessage('Señal compartida en el grupo.');
    } catch (err) {
      setShareMessage(err?.message || 'No se pudo compartir la señal.');
    } finally {
      setShareLoadingId('');
    }
  };

  const exportAlertReport = async (alertId, symbol) => {
    if (typeof api.exportAlertPdf !== 'function') return;

    setExportLoadingId(alertId);
    setExportMessage('');

    try {
      const buffer = await api.exportAlertPdf(alertId);
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `horsai-alert-${symbol || alertId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportMessage('PDF exportado correctamente.');
    } catch (err) {
      setExportMessage(err?.message || 'No se pudo exportar PDF.');
    } finally {
      setExportLoadingId('');
    }
  };

  const renderShareControls = (alertId) => {
    if (!groups.length) {
      if (groupsLoading) return <div className="muted">Cargando grupos...</div>;
      return <div className="muted">No tenés grupos para compartir.</div>;
    }

    return (
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8 }}>
        <select
          className="select-field"
          aria-label={`Grupo para compartir ${alertId}`}
          value={shareGroupByAlert[alertId] || ''}
          onChange={(e) => setShareGroupByAlert((prev) => ({ ...prev, [alertId]: e.target.value }))}
          style={{ width: 220 }}
        >
          <option value="">Seleccioná un grupo</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => shareAlertToGroup(alertId)} disabled={shareLoadingId === alertId}>
          {shareLoadingId === alertId ? 'Compartiendo...' : 'Compartir señal'}
        </button>
      </div>
    );
  };

  const renderLive = () => (
    <>
      <section className="card alerts-toolbar">
        {LIVE_TABS.map((t) => (
          <button key={t} type="button" onClick={() => setLiveTab(t)} style={{ borderColor: liveTab === t ? '#00E08E' : undefined }}>
            {t}
          </button>
        ))}
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Agente IA</h2>
        <div className="muted" style={{ marginBottom: 8 }}>Preguntá por oportunidades, riesgo o activos puntuales.</div>
        <div className="chat-area">
          {!chatMessages.length ? (
            <div className="muted">Preguntale al agente sobre activos, señales o riesgo de portfolio.</div>
          ) : null}
          {chatMessages.map((msg, idx) => (
            <div key={`${msg.role}-${idx}`} className={`chat-bubble ${msg.role === 'user' ? 'chat-user' : 'chat-ai'}`}>
              {msg.text}
            </div>
          ))}
        </div>
        {!chatMessages.length ? (
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => askAgent(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
        <div className="row" style={{ marginTop: 8 }}>
          <input
            placeholder="Preguntale al agente..."
            value={agentQuery}
            onChange={(e) => setAgentQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') askAgent(agentQuery);
            }}
          />
          <button type="button" onClick={() => askAgent(agentQuery)} disabled={agentLoading}>
            {agentLoading ? 'Pensando...' : 'Enviar'}
          </button>
        </div>
      </section>

      {liveList.map((a) => (
        <article
          key={a.id}
          className="card card-clickable"
          onClick={() => setSelectedLiveAlert(a)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setSelectedLiveAlert(a);
            }
          }}
        >
          <div className="row">
            <strong>{a.title}</strong>
            <span className="muted">{a.confidence || 'high'}</span>
          </div>
          {typeof a.net === 'number' && <ConfluenceBar net={a.net} />}
          {a.stopLoss && (
            <div className="alert-meta" style={{ marginTop: 8 }}>
              <span className="mono">{`SL ${formatUSD(a.stopLoss)}`}</span>
              <span className="mono">{`TP ${formatUSD(a.takeProfit)}`}</span>
              <span className="mono">{String(a.confidence || 'high')}</span>
            </div>
          )}
          {(a.type === 'compra' || a.type === 'venta') && (
            <button
              type="button"
              style={{ marginTop: 8 }}
              onClick={(event) => {
                event.stopPropagation();
                openThesis(a);
              }}
              disabled={loadingId === a.id}
            >
              {loadingId === a.id ? 'Generando...' : 'Ver tesis de inversión AI'}
            </button>
          )}
        </article>
      ))}
      {!liveList.length && <div className="card muted">No hay alertas para este filtro.</div>}

      {selectedLiveAlert ? (
        <section className="modal-backdrop" role="presentation" onClick={() => setSelectedLiveAlert(null)}>
          <article className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ marginBottom: 6 }}>{selectedLiveAlert.symbol || 'Señal'}</h3>
                <div className="muted">{selectedLiveAlert.title || selectedLiveAlert.recommendation || 'Recomendación del Agente IA'}</div>
              </div>
              <button type="button" onClick={() => setSelectedLiveAlert(null)}>
                Cerrar
              </button>
            </div>
            <div className="grid" style={{ marginTop: 10 }}>
              <div className="ind-cell trend-panel">
                <div className="ind-label">Evolución (45 velas)</div>
                <div className="trend-chart">
                  <Sparkline values={selectedSeries} color={Number(trendDeltaPct || 0) >= 0 ? '#00E08E' : '#FF4757'} height={56} />
                </div>
                <div className={`trend-meta mono ${Number(trendDeltaPct || 0) >= 0 ? 'up' : 'down'}`}>
                  {trendDeltaPct == null ? '-' : `${trendDeltaPct.toFixed(2)}%`}
                </div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Confluencia</div>
                <div className="ind-val mono">
                  {Number(selectedLiveAlert.net ?? selectedLiveAlert.confluenceBull ?? 0) - Number(selectedLiveAlert.confluenceBear ?? 0)}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Confluencia = puntos alcistas - puntos bajistas. Valor negativo implica sesgo bajista.
                </div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Apertura</div>
                <div className="ind-val mono">{formatUSD(Number(selectedAsset?.candles?.o?.[selectedAsset?.candles?.o?.length - 1]))}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Cierre</div>
                <div className="ind-val mono">{formatUSD(Number(selectedAsset?.candles?.c?.[selectedAsset?.candles?.c?.length - 1]))}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">P/E</div>
                <div className="ind-val mono">{selectedFundamentals.loading ? '...' : selectedFundamentals.pe}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Capitalización</div>
                <div className="ind-val mono">{selectedFundamentals.loading ? '...' : formatLargeNumber(selectedFundamentals.marketCap)}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Stop loss</div>
                <div className="ind-val mono">{selectedLiveAlert.stopLoss ? formatUSD(selectedLiveAlert.stopLoss) : '-'}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Take profit</div>
                <div className="ind-val mono">{selectedLiveAlert.takeProfit ? formatUSD(selectedLiveAlert.takeProfit) : '-'}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Confianza</div>
                <div className="ind-val mono">{String(selectedLiveAlert.confidence || 'high')}</div>
              </div>
            </div>
          </article>
        </section>
      ) : null}
    </>
  );

  const renderHistory = () => (
    <>
      <section className="card alerts-toolbar">
        {HISTORY_TYPE_TABS.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setHistoryType(type);
              setHistoryPage(1);
            }}
            style={{ borderColor: historyType === type ? '#00E08E' : undefined }}
          >
            {HISTORY_TYPE_LABEL[type]}
          </button>
        ))}
      </section>

      {historyLoading && <div className="card muted">Cargando historial...</div>}
      {!!historyError && <div className="card" style={{ borderColor: '#FF4757AA' }}>{historyError}</div>}
      {!!shareMessage && <div className="card" style={{ borderColor: '#60A5FA88' }}>{shareMessage}</div>}
      {!!exportMessage && <div className="card" style={{ borderColor: '#60A5FA88' }}>{exportMessage}</div>}

      {!historyLoading && !historyError && (
        <>
          {historyList.map((a) => (
            <article key={a.id} className="card alerts-history-card">
              <div className="row">
                <strong>
                  {a.symbol} · {a.recommendation}
                </strong>
                <span className="muted">{shortDate(a.createdAt)}</span>
              </div>
              <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                <span className="badge" style={{ background: '#60A5FA22', color: '#60A5FA' }}>{HISTORY_TYPE_LABEL[a.type] || a.type}</span>
                <span className="badge" style={{ background: '#FBBF2422', color: '#FBBF24' }}>{a.outcome || 'open'}</span>
                <span className="muted mono" style={{ minWidth: 128, textAlign: 'right' }}>Precio alerta: {formatUSD(a.priceAtAlert)}</span>
                <span className="muted">Confianza: {a.confidence}</span>
              </div>
              {renderShareControls(a.id)}
              <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start' }}>
                <button type="button" onClick={() => exportAlertReport(a.id, a.symbol)} disabled={exportLoadingId === a.id}>
                  {exportLoadingId === a.id ? 'Exportando...' : 'Exportar PDF'}
                </button>
              </div>
            </article>
          ))}

          {!historyList.length && <div className="card muted">No hay alertas en historial para este filtro.</div>}

          <section className="card row" style={{ marginTop: 8 }}>
            <span className="muted">
              Página {historyData.pagination.page} de {historyData.pagination.pages}
            </span>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                disabled={historyData.pagination.page <= 1 || historyLoading}
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={historyData.pagination.page >= historyData.pagination.pages || historyLoading}
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );

  const renderPerformance = () => {
    const stats = historyData.stats || {};
    const hitRatePct = Number(stats.hitRate || 0) * 100;

    return (
      <>
        <section className="grid grid-2">
          <article className="card">
            <h3>Tasa de acierto</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{formatPct(hitRatePct)}</div>
          </article>
          <article className="card">
            <h3>Retorno Promedio</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{formatPct(Number(stats.avgReturn || 0))}</div>
          </article>
          <article className="card">
            <h3>Total alertas</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{Number(stats.total || 0)}</div>
          </article>
          <article className="card">
            <h3>Desglose</h3>
            <div className="muted" style={{ marginTop: 6 }}>
              Compra: {Number(stats.opportunities || 0)} · Venta: {Number(stats.bearish || 0)} · Stop loss: {Number(stats.stopLoss || 0)}
            </div>
          </article>
        </section>

        <section className="card row" style={{ flexWrap: 'wrap' }}>
          {OUTCOME_TABS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setOutcomeFilter(type)}
              style={{ borderColor: outcomeFilter === type ? '#00E08E' : undefined }}
            >
              {OUTCOME_LABEL[type]}
            </button>
          ))}
        </section>

        {historyLoading && <div className="card muted">Cargando rendimiento...</div>}
        {!!historyError && <div className="card" style={{ borderColor: '#FF4757AA' }}>{historyError}</div>}

        {!historyLoading && !historyError && (
          <div className="grid">
            {performanceList.map((a) => (
              <article key={a.id} className="card row" style={{ flexWrap: 'wrap' }}>
                <strong>{a.symbol}</strong>
                <span className="muted">{a.recommendation}</span>
                <span className="muted">{shortDate(a.createdAt)}</span>
                <span className="muted">Resultado: {a.outcome}</span>
                <span className="muted mono" style={{ minWidth: 108, textAlign: 'right' }}>Precio: {formatUSD(a.priceAtAlert)}</span>
              </article>
            ))}

            {!performanceList.length && <div className="card muted">No hay alertas para este filtro de resultado.</div>}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="grid">
      {thesis && <AIThesis thesis={thesis} symbol={thesisSymbol} onClose={() => setThesis(null)} />}

      <section className="card alerts-toolbar">
        {MAIN_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setMainTab(t);
              if (t !== 'live') setHistoryPage(1);
            }}
            style={{ borderColor: mainTab === t ? '#00E08E' : undefined }}
          >
            {MAIN_LABEL[t]}
          </button>
        ))}
      </section>

      {mainTab === 'live' && renderLive()}
      {mainTab === 'history' && renderHistory()}
      {mainTab === 'performance' && renderPerformance()}
    </div>
  );
};

export default Alerts;
