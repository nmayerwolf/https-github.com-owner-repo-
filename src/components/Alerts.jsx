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
import AlertCard from './common/AlertCard';
import Sparkline from './common/Sparkline';

const MAIN_TABS = ['live', 'macro', 'history', 'performance'];
const LIVE_TABS = ['all', 'compra', 'venta'];
const ASSET_CLASS_TABS = ['all', 'equity', 'crypto', 'metal', 'commodity', 'bond', 'fx'];
const HISTORY_TYPE_TABS = ['all', ...ALERT_TYPES];
const OUTCOME_TABS = ['all', ...ALERT_OUTCOMES];

const MAIN_LABEL = {
  live: 'En vivo',
  macro: 'Macro',
  history: 'Historial',
  performance: 'Rendimiento'
};
const LIVE_TAB_LABEL = {
  all: 'all',
  compra: 'compra',
  venta: 'venta'
};
const ASSET_CLASS_LABEL = {
  all: 'all',
  equity: 'equity',
  crypto: 'crypto',
  metal: 'metal',
  commodity: 'commodity',
  bond: 'bond',
  fx: 'fx'
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

const quickPrompts = ['Acciones oversold', 'Crypto momentum hoy', 'Mejores señales de compra', 'Panorama macro global'];
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

const buildFundamentalOutlook = (assets = []) => {
  const list = Array.isArray(assets) ? assets : [];
  if (!list.length) {
    return {
      bullish: ['Todavia no hay datos de mercado suficientes para detectar drivers alcistas.'],
      bearish: ['Todavia no hay datos de mercado suficientes para detectar riesgos bajistas.']
    };
  }

  const valid = list
    .map((a) => ({
      category: String(a?.category || 'other').toLowerCase(),
      sector: String(a?.sector || 'general').toLowerCase(),
      change: Number(a?.changePercent || 0)
    }))
    .filter((a) => Number.isFinite(a.change));

  const advancers = valid.filter((a) => a.change > 0).length;
  const breadth = valid.length ? (advancers / valid.length) * 100 : 50;
  const avgChange = valid.length ? valid.reduce((acc, a) => acc + a.change, 0) / valid.length : 0;
  const avgAbsMove = valid.length ? valid.reduce((acc, a) => acc + Math.abs(a.change), 0) / valid.length : 0;

  const byCategory = new Map();
  const bySector = new Map();
  for (const item of valid) {
    const cat = byCategory.get(item.category) || { total: 0, count: 0 };
    cat.total += item.change;
    cat.count += 1;
    byCategory.set(item.category, cat);

    const sec = bySector.get(item.sector) || { total: 0, count: 0 };
    sec.total += item.change;
    sec.count += 1;
    bySector.set(item.sector, sec);
  }

  const categoryAvg = [...byCategory.entries()].map(([key, value]) => ({
    key,
    avg: value.count ? value.total / value.count : 0
  }));
  const sectorAvg = [...bySector.entries()].map(([key, value]) => ({
    key,
    avg: value.count ? value.total / value.count : 0
  }));

  const topCategory = categoryAvg.slice().sort((a, b) => b.avg - a.avg)[0];
  const weakCategory = categoryAvg.slice().sort((a, b) => a.avg - b.avg)[0];
  const topSector = sectorAvg.slice().sort((a, b) => b.avg - a.avg)[0];
  const weakSector = sectorAvg.slice().sort((a, b) => a.avg - b.avg)[0];

  const bullish = [];
  const bearish = [];

  if (breadth >= 58) bullish.push(`Amplitud positiva: ${Math.round(breadth)}% del universo monitoreado opera en verde.`);
  if (avgChange >= 0.35) bullish.push(`Sesgo de riesgo activo: variacion promedio de mercado en ${formatPct(avgChange)}.`);
  if (topCategory && topCategory.avg > 0.5) bullish.push(`Liderazgo por clase de activo en ${topCategory.key} (${formatPct(topCategory.avg)} promedio).`);
  if (topSector && topSector.avg > 0.5) bullish.push(`Impulso sectorial en ${topSector.key}, senal de rotacion hacia crecimiento.`);
  if (avgAbsMove <= 1.2) bullish.push(`Volatilidad contenida (${formatPct(avgAbsMove)} promedio absoluto), favorable para continuidad de tendencia.`);

  if (breadth <= 42) bearish.push(`Amplitud debil: solo ${Math.round(breadth)}% del universo muestra avance.`);
  if (avgChange <= -0.35) bearish.push(`Sesgo defensivo: variacion promedio de mercado en ${formatPct(avgChange)}.`);
  if (weakCategory && weakCategory.avg < -0.5) bearish.push(`Presion en ${weakCategory.key} (${formatPct(weakCategory.avg)} promedio), posible arrastre al resto del mercado.`);
  if (weakSector && weakSector.avg < -0.5) bearish.push(`Deterioro relativo en ${weakSector.key}, senal de menor apetito por riesgo.`);
  if (avgAbsMove >= 1.8) bearish.push(`Volatilidad elevada (${formatPct(avgAbsMove)} promedio absoluto), riesgo de movimientos bruscos.`);

  return {
    bullish: bullish.slice(0, 5).length ? bullish.slice(0, 5) : ['No se detectan drivers alcistas de alta conviccion en este momento.'],
    bearish: bearish.slice(0, 5).length ? bearish.slice(0, 5) : ['No se detectan riesgos bajistas estructurales dominantes en este momento.']
  };
};

const Alerts = () => {
  const { state, actions } = useApp();

  const [mainTab, setMainTab] = useState('live');
  const [liveTab, setLiveTab] = useState('all');
  const [liveAssetClass, setLiveAssetClass] = useState('all');

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
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroRefreshing, setMacroRefreshing] = useState(false);
  const [macroError, setMacroError] = useState('');
  const [macroInsight, setMacroInsight] = useState(null);
  const [portfolioAdviceLoading, setPortfolioAdviceLoading] = useState(false);
  const [portfolioAdviceRefreshing, setPortfolioAdviceRefreshing] = useState(false);
  const [portfolioAdviceError, setPortfolioAdviceError] = useState('');
  const [portfolioAdvice, setPortfolioAdvice] = useState(null);
  const [portfolioAdviceSkipped, setPortfolioAdviceSkipped] = useState(null);
  const askAgentFn = typeof askClaude === 'function' ? askClaude : async () => ({ text: '' });

  const assetsBySymbol = useMemo(
    () =>
      Object.fromEntries(
        (state.assets || []).map((asset) => [String(asset?.symbol || '').toUpperCase(), String(asset?.category || '').toLowerCase()])
      ),
    [state.assets]
  );
  const liveList = useMemo(() => {
    return state.alerts.filter((alert) => {
      if (alert.type === 'stoploss') return false;
      if (liveTab !== 'all' && alert.type !== liveTab) return false;
      if (liveAssetClass === 'all') return true;
      const symbol = String(alert?.symbol || '').toUpperCase();
      const category = assetsBySymbol[symbol];
      return category === liveAssetClass;
    });
  }, [liveTab, liveAssetClass, state.alerts, assetsBySymbol]);
  const portfolio = useMemo(() => {
    const assetsBySymbol = Object.fromEntries((state.assets || []).map((a) => [a.symbol, a]));
    const active = (state.positions || []).filter((p) => !p.sellDate);
    let invested = 0;
    let value = 0;
    active.forEach((p) => {
      invested += p.buyPrice * p.quantity;
      const current = assetsBySymbol[p.symbol]?.price ?? p.buyPrice;
      value += current * p.quantity;
    });
    const pnl = value - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { invested, value, pnl, pnlPct };
  }, [state.assets, state.positions]);
  const agentPerformance = useMemo(
    () => ({
      hitRate: Number(state.alerts.length ? (state.alerts.filter((a) => String(a.type).includes('compra')).length / state.alerts.length) * 100 : 0),
      avgReturn: portfolio.invested ? (portfolio.pnl / portfolio.invested) * 100 : 0,
      avgLoss: Math.min(0, portfolio.pnlPct - 5),
      rr: 2.5
    }),
    [state.alerts, portfolio.invested, portfolio.pnl, portfolio.pnlPct]
  );
  const outlook = useMemo(() => buildFundamentalOutlook(state.assets), [state.assets]);
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
    if (mainTab === 'live' || mainTab === 'macro') return;

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
    if (mainTab === 'live' || mainTab === 'macro') return;

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
    if (mainTab !== 'macro') return;

    let active = true;
    const loadMacro = async () => {
      setMacroLoading(true);
      setMacroError('');
      setPortfolioAdviceLoading(true);
      setPortfolioAdviceError('');
      try {
        const [macroOut, adviceOut] = await Promise.all([
          api.getMacroInsight(),
          api.getPortfolioAdvice().catch(() => ({ advice: null }))
        ]);
        if (!active) return;
        setMacroInsight(macroOut?.insight || null);
        setPortfolioAdvice(adviceOut?.advice || null);
        setPortfolioAdviceSkipped(adviceOut?.skipped ? adviceOut : null);
      } catch {
        if (!active) return;
        setMacroError('No se pudo cargar el Macro Radar.');
      } finally {
        if (active) {
          setMacroLoading(false);
          setPortfolioAdviceLoading(false);
        }
      }
    };

    loadMacro();
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
      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Agente IA</h2>
        <div className="muted" style={{ marginBottom: 8 }}>Consultá el panorama de mercado y definí tu estrategia.</div>
        <div className="chat-area">
          {!chatMessages.length ? (
            <div className="muted">Escribí tu consulta para empezar.</div>
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

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Fundamentals bullish (macro)</h3>
        </div>
        <ul className="muted" style={{ marginTop: 8, paddingLeft: 18 }}>
          {outlook.bullish.slice(0, 5).map((point, idx) => (
            <li key={`bullish-${idx}`} style={{ marginBottom: 6 }}>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Fundamentals bearish (macro)</h3>
        </div>
        <ul className="muted" style={{ marginTop: 8, paddingLeft: 18 }}>
          {outlook.bearish.slice(0, 5).map((point, idx) => (
            <li key={`bearish-${idx}`} style={{ marginBottom: 6 }}>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Activos financieros recomendados</h3>
        </div>
        <div className="muted" style={{ marginBottom: 8 }}>Senales operativas activas, filtradas por tipo.</div>
        <div className="alerts-toolbar" style={{ marginBottom: 8 }}>
          {LIVE_TABS.map((t) => (
            <button key={t} type="button" onClick={() => setLiveTab(t)} style={{ borderColor: liveTab === t ? '#00E08E' : undefined }}>
              {LIVE_TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="alerts-toolbar" style={{ marginBottom: 8 }}>
          {ASSET_CLASS_TABS.map((assetClass) => (
            <button
              key={assetClass}
              type="button"
              onClick={() => setLiveAssetClass(assetClass)}
              style={{ borderColor: liveAssetClass === assetClass ? '#60A5FA' : undefined }}
            >
              {ASSET_CLASS_LABEL[assetClass]}
            </button>
          ))}
        </div>
        <div className="alerts-grid-list">
          {liveList.map((a) => (
            <section key={a.id} className="grid" style={{ gap: 8 }}>
              <AlertCard
                alert={a}
                onClick={() => {
                  setSelectedLiveAlert((prev) => (prev?.id === a.id ? null : a));
                }}
              />
              {selectedLiveAlert?.id === a.id ? (
                <article className="card">
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ marginBottom: 6 }}>{selectedLiveAlert.symbol || 'Senal'}</h3>
                      <div className="muted">{selectedLiveAlert.title || selectedLiveAlert.recommendation || 'Recomendacion del Agente IA'}</div>
                    </div>
                    <button type="button" onClick={() => setSelectedLiveAlert(null)}>
                      Ocultar detalle
                    </button>
                  </div>
                  <div className="grid" style={{ marginTop: 10 }}>
                    <div className="ind-cell trend-panel">
                      <div className="ind-label">Evolucion (45 velas)</div>
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
                      <div className="ind-label">Capitalizacion</div>
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
              ) : null}
              {(a.type === 'compra' || a.type === 'venta') ? (
                <button
                  type="button"
                  onClick={() => openThesis(a)}
                  disabled={loadingId === a.id}
                >
                  {loadingId === a.id ? 'Generando...' : 'Ver tesis de inversion AI'}
                </button>
              ) : null}
            </section>
          ))}
          {!liveList.length ? <div className="card muted">No hay alertas para este filtro.</div> : null}
        </div>
      </section>
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
    const hitRate24hPct = Number(stats.hitRate24h || 0) * 100;
    const hitRate7dPct = Number(stats.hitRate7d || 0) * 100;
    const hitRate30dPct = Number(stats.hitRate30d || 0) * 100;
    const trend = Array.isArray(stats.trendLast30) ? stats.trendLast30.map((v) => (Number(v) > 0 ? 1 : 0)) : [];

    return (
      <>
        <section className="grid grid-2">
          <article className="card">
            <h3>Tasa de acierto</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{formatPct(agentPerformance.hitRate)}</div>
          </article>
          <article className="card">
            <h3>Retorno Promedio</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{formatPct(agentPerformance.avgReturn)}</div>
          </article>
          <article className="card">
            <h3>Pérdida promedio</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{formatPct(agentPerformance.avgLoss)}</div>
          </article>
          <article className="card">
            <h3>Riesgo/Beneficio</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>1:{agentPerformance.rr.toFixed(1)}</div>
          </article>
          <article className="card">
            <h3>Tasa de acierto (historial)</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{formatPct(hitRatePct)}</div>
          </article>
          <article className="card">
            <h3>Retorno Promedio (historial)</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{formatPct(Number(stats.avgReturn || 0))}</div>
          </article>
          <article className="card">
            <h3>Hit Rate 24h</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{formatPct(hitRate24hPct)}</div>
          </article>
          <article className="card">
            <h3>Hit Rate 7d</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{formatPct(hitRate7dPct)}</div>
          </article>
          <article className="card">
            <h3>Hit Rate 30d</h3>
            <div style={{ fontSize: 22, marginTop: 6 }}>{formatPct(hitRate30dPct)}</div>
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

        <section className="card">
          <h3 style={{ marginBottom: 8 }}>Win rate últimas 30 señales cerradas</h3>
          {trend.length ? (
            <>
              <Sparkline values={trend} color="#60A5FA" height={52} />
              <div className="muted" style={{ marginTop: 8 }}>1 = win, 0 = loss</div>
            </>
          ) : (
            <div className="muted">Todavía no hay señales cerradas suficientes.</div>
          )}
        </section>

        <section className="grid grid-2">
          <article className="card">
            <h3>Mejor señal del mes</h3>
            {stats.bestSignalMonth ? (
              <div className="muted" style={{ marginTop: 6 }}>
                {stats.bestSignalMonth.symbol} · {stats.bestSignalMonth.recommendation} · {formatPct(Number(stats.bestSignalMonth.realizedReturnPct || 0))}
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 6 }}>Sin datos del último mes.</div>
            )}
          </article>
          <article className="card">
            <h3>Peor señal del mes</h3>
            {stats.worstSignalMonth ? (
              <div className="muted" style={{ marginTop: 6 }}>
                {stats.worstSignalMonth.symbol} · {stats.worstSignalMonth.recommendation} · {formatPct(Number(stats.worstSignalMonth.realizedReturnPct || 0))}
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 6 }}>Sin datos del último mes.</div>
            )}
          </article>
        </section>

        <section className="card">
          <h3 style={{ marginBottom: 8 }}>Dónde el agente es más preciso</h3>
          <div className="grid">
            {Array.isArray(stats.byType) && stats.byType.length ? (
              stats.byType
                .slice()
                .sort((a, b) => Number(b.hitRate || 0) - Number(a.hitRate || 0))
                .slice(0, 3)
                .map((row) => (
                  <div key={`type-${row.type}`} className="muted">
                    {row.type}: {formatPct(Number(row.hitRate || 0) * 100)} ({Number(row.wins || 0)}W/{Number(row.losses || 0)}L)
                  </div>
                ))
            ) : (
              <div className="muted">Sin datos de precisión por tipo todavía.</div>
            )}
          </div>
          <div className="grid" style={{ marginTop: 10 }}>
            {Array.isArray(stats.byAssetClass) && stats.byAssetClass.length ? (
              stats.byAssetClass
                .slice()
                .sort((a, b) => Number(b.hitRate || 0) - Number(a.hitRate || 0))
                .slice(0, 3)
                .map((row) => (
                  <div key={`asset-class-${row.asset_class}`} className="muted">
                    {row.asset_class}: {formatPct(Number(row.hitRate || 0) * 100)} ({Number(row.wins || 0)}W/{Number(row.losses || 0)}L)
                  </div>
                ))
            ) : (
              <div className="muted">Sin datos de precisión por clase de activo todavía.</div>
            )}
          </div>
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

  const refreshMacroInsight = async () => {
    setMacroRefreshing(true);
    setMacroError('');
    try {
      const out = await api.refreshMacroInsight();
      setMacroInsight(out?.insight || null);
    } catch {
      setMacroError('No se pudo recalcular el Macro Radar.');
    } finally {
      setMacroRefreshing(false);
    }
  };

  const refreshPortfolioAdvice = async () => {
    setPortfolioAdviceRefreshing(true);
    setPortfolioAdviceError('');
    try {
      const out = await api.refreshPortfolioAdvice();
      if (out?.skipped) {
        setPortfolioAdvice(null);
        setPortfolioAdviceSkipped(out);
      } else {
        setPortfolioAdvice(out?.advice || null);
        setPortfolioAdviceSkipped(null);
      }
    } catch {
      setPortfolioAdviceError('No se pudo recalcular el análisis de portfolio.');
    } finally {
      setPortfolioAdviceRefreshing(false);
    }
  };

  const renderMacro = () => {
    const insight = macroInsight;

    return (
      <>
        <section className="card row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ marginBottom: 6 }}>Macro Radar</h3>
            <div className="muted">Lectura top-down de mercado con temas y activos sugeridos.</div>
          </div>
          <button type="button" onClick={refreshMacroInsight} disabled={macroRefreshing}>
            {macroRefreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        </section>

        {macroLoading ? <section className="card muted">Cargando Macro Radar...</section> : null}
        {macroError ? <section className="card" style={{ borderColor: '#FF4757AA' }}>{macroError}</section> : null}
        {!macroLoading && !macroError && !insight ? <section className="card muted">Todavía no hay insight macro para este usuario.</section> : null}

        {!macroLoading && !macroError && insight ? (
          <>
            <section className="card">
              <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                <span className="badge" style={{ background: '#60A5FA22', color: '#60A5FA' }}>
                  Sentimiento: {insight.marketSentiment || 'neutral'}
                </span>
                <span className="muted">{shortDate(insight.createdAt)}</span>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>{insight.sentimentReasoning || 'Sin resumen disponible.'}</div>
            </section>

            <section className="grid">
              {(insight.themes || []).map((theme, idx) => (
                <article key={`${theme.theme || 'theme'}-${idx}`} className="card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{theme.theme}</strong>
                    <span className="badge" style={{ background: '#FBBF2422', color: '#FBBF24' }}>
                      Convicción {Number(theme.conviction || 0)}/10
                    </span>
                  </div>
                  <div className="muted" style={{ marginTop: 8 }}>{theme.reasoning}</div>
                  {(theme.suggested_assets || []).length ? (
                    <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                      {theme.suggested_assets.map((asset) => (
                        <span key={`${theme.theme}-${asset.symbol}`} className="badge" style={{ background: '#00E08E22', color: '#00E08E' }}>
                          {asset.symbol}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </section>

            {(insight.keyEvents || []).length ? (
              <section className="card">
                <h3 style={{ marginBottom: 8 }}>Eventos próximos</h3>
                <div className="grid">
                  {insight.keyEvents.map((event) => (
                    <article key={`${event.event}-${event.date}`} className="card">
                      <strong>{event.event}</strong>
                      <div className="muted">{event.date}</div>
                      <div className="muted" style={{ marginTop: 6 }}>{event.potential_impact}</div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ marginBottom: 6 }}>Portfolio Advisor</h3>
                  <div className="muted">Recomendaciones de rebalanceo basadas en tu cartera y macro.</div>
                </div>
                <button type="button" onClick={refreshPortfolioAdvice} disabled={portfolioAdviceRefreshing}>
                  {portfolioAdviceRefreshing ? 'Analizando...' : 'Pedir análisis AI'}
                </button>
              </div>

              {portfolioAdviceLoading ? <div className="muted" style={{ marginTop: 8 }}>Cargando análisis de portfolio...</div> : null}
              {portfolioAdviceError ? <div className="card" style={{ marginTop: 8, borderColor: '#FF4757AA' }}>{portfolioAdviceError}</div> : null}
              {portfolioAdviceSkipped ? (
                <div className="card muted" style={{ marginTop: 8 }}>
                  Necesitás al menos {portfolioAdviceSkipped.minimumPositions || 2} posiciones activas para habilitar Portfolio Advisor.
                </div>
              ) : null}

              {portfolioAdvice ? (
                <div className="grid" style={{ marginTop: 8 }}>
                  <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                    <span className="badge" style={{ background: '#8CC8FF22', color: '#8CC8FF' }}>
                      Health score: {Number(portfolioAdvice.healthScore || 0)}/10
                    </span>
                    <span className="badge" style={{ background: '#FBBF2422', color: '#FBBF24' }}>
                      Riesgo: {portfolioAdvice.concentrationRisk || 'medium'}
                    </span>
                  </div>
                  <div className="muted">{portfolioAdvice.healthSummary}</div>
                  <div className="grid">
                    {(portfolioAdvice.recommendations || []).map((rec, idx) => (
                      <article key={`${rec.asset || 'asset'}-${idx}`} className="card">
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <strong>{rec.asset}</strong>
                          <span className="muted">{rec.priority || 'medium'}</span>
                        </div>
                        <div className="muted" style={{ marginTop: 6 }}>{rec.detail}</div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </>
    );
  };

  return (
    <div className="grid">
      {thesis && <AIThesis thesis={thesis} symbol={thesisSymbol} onClose={() => setThesis(null)} />}

      {mainTab === 'live' && renderLive()}

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

      {mainTab === 'history' && renderHistory()}
      {mainTab === 'macro' && renderMacro()}
      {mainTab === 'performance' && renderPerformance()}
    </div>
  );
};

export default Alerts;
