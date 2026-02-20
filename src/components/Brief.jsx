import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { formatPct, formatUSD } from '../utils/format';

const BRIEF_HISTORY_KEY = 'horsai_brief_history_v1';

const CHANGE_TAG_BY_CATEGORY = {
  equity: 'Equity',
  crypto: 'Crypto',
  metal: 'Macro',
  commodity: 'Macro',
  bond: 'Rates',
  fx: 'Rates'
};

const ACTION_BY_TYPE = {
  compra: 'BUY',
  venta: 'SELL',
  stoploss: 'REDUCE',
  takeprofit: 'HOLD'
};

const HORIZON_BY_TYPE = {
  compra: 'Tactical',
  venta: 'Short',
  stoploss: 'Short',
  takeprofit: 'Tactical'
};

const CONFIDENCE_WEIGHT = { high: 0.84, medium: 0.62, low: 0.4 };

const confidenceToLabel = (value) => {
  const key = String(value || '').toLowerCase();
  if (key === 'high') return 'High';
  if (key === 'low') return 'Low';
  return 'Medium';
};

const scoreToConfidence = (score) => {
  if (score >= 0.74) return 'High';
  if (score >= 0.56) return 'Medium';
  return 'Low';
};

const splitWhy = (text = '') =>
  String(text || '')
    .split(/[.!?]\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);

const toUnixSeconds = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed / 1000) : 0;
};

const timeAgo = (value) => {
  const ts = toUnixSeconds(value);
  if (!ts) return 'just now';
  const diffMin = Math.max(1, Math.floor((Date.now() / 1000 - ts) / 60));
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const loadBriefHistory = () => {
  try {
    const raw = localStorage.getItem(BRIEF_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveBriefHistory = (items = []) => {
  try {
    localStorage.setItem(BRIEF_HISTORY_KEY, JSON.stringify(items));
  } catch {
    // noop
  }
};

const normalizePoint = (value) => String(value || '').trim().toLowerCase();

const buildReplayDiff = (current = null, previous = null) => {
  if (!current || !previous) return null;
  const currentChanged = new Set((current.changed || []).map(normalizePoint));
  const previousChanged = new Set((previous.changed || []).map(normalizePoint));
  const currentActions = new Set((current.actions || []).map(normalizePoint));
  const previousActions = new Set((previous.actions || []).map(normalizePoint));

  const addedChanges = (current.changed || []).filter((item) => !previousChanged.has(normalizePoint(item))).slice(0, 3);
  const droppedChanges = (previous.changed || []).filter((item) => !currentChanged.has(normalizePoint(item))).slice(0, 3);
  const addedActions = (current.actions || []).filter((item) => !previousActions.has(normalizePoint(item))).slice(0, 3);
  const droppedActions = (previous.actions || []).filter((item) => !currentActions.has(normalizePoint(item))).slice(0, 3);

  return {
    addedChanges,
    droppedChanges,
    addedActions,
    droppedActions
  };
};

const Brief = () => {
  const navigate = useNavigate();
  const { state } = useApp();
  const [mode, setMode] = useState('normal');
  const [newsItems, setNewsItems] = useState([]);
  const [newsError, setNewsError] = useState('');
  const [briefHistory, setBriefHistory] = useState(() => loadBriefHistory());
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const [historyModeFilter, setHistoryModeFilter] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);

  const assetsBySymbol = useMemo(
    () => Object.fromEntries((state.assets || []).map((asset) => [String(asset.symbol || '').toUpperCase(), asset])),
    [state.assets]
  );

  const changed = useMemo(() => {
    const rows = (state.assets || [])
      .filter((asset) => Number.isFinite(Number(asset.changePercent)))
      .map((asset) => ({ ...asset, absChange: Math.abs(Number(asset.changePercent || 0)) }))
      .sort((a, b) => b.absChange - a.absChange)
      .slice(0, 6)
      .map((asset) => {
        const tag = CHANGE_TAG_BY_CATEGORY[String(asset.category || '').toLowerCase()] || 'Macro';
        const raw = Number(asset.changePercent || 0);
        const direction = raw >= 0 ? 'rising' : 'weakening';
        const confidenceScore = Math.min(0.9, 0.45 + Math.min(0.4, Math.abs(raw) / 6));
        return {
          id: asset.symbol,
          tag,
          text: `${asset.symbol} momentum ${direction} (${formatPct(raw)})`,
          confidenceScore,
          confidence: scoreToConfidence(confidenceScore)
        };
      });

    if (rows.length) return rows;
    return [
      { id: 'fallback-1', tag: 'Macro', text: 'Volatility rising in US equities', confidenceScore: 0.58, confidence: 'Medium' },
      { id: 'fallback-2', tag: 'Rates', text: 'Liquidity tightening in short-term rates', confidenceScore: 0.54, confidence: 'Low' },
      { id: 'fallback-3', tag: 'Crypto', text: 'BTC momentum weakening', confidenceScore: 0.64, confidence: 'Medium' }
    ];
  }, [state.assets]);

  const actions = useMemo(() => {
    const cards = (state.alerts || [])
      .slice(0, 5)
      .map((alert, idx) => {
        const type = String(alert.type || '').toLowerCase();
        const action = ACTION_BY_TYPE[type] || 'HOLD';
        const confidenceRaw = String(alert.confidence || 'medium').toLowerCase();
        const confidence = confidenceToLabel(confidenceRaw);
        const horizon = HORIZON_BY_TYPE[type] || 'Tactical';
        const symbol = String(alert.symbol || 'Market');
        const why = splitWhy(alert.aiReasoning);
        const reasons = why.length
          ? why
          : [
              `Confluence spread: ${Number(alert.confluenceBull || 0) - Number(alert.confluenceBear || 0)} points.`,
              `Signal context: ${type || 'market signal'}.`
            ];
        const invalidation = Number.isFinite(Number(alert.stopLoss))
          ? `If ${symbol} < ${formatUSD(Number(alert.stopLoss))}, invalidate and reduce exposure.`
          : Number.isFinite(Number(alert.takeProfit))
            ? `If ${symbol} > ${formatUSD(Number(alert.takeProfit))}, lock gains and reassess.`
            : `If confluence turns against thesis in the next session, reduce risk.`;
        return {
          id: alert.id || `${symbol}-${idx}`,
          action,
          asset: symbol,
          confidence,
          horizon,
          why: reasons.slice(0, 2),
          invalidation
        };
      });

    if (cards.length) return cards;
    return [
      {
        id: 'fallback-action',
        action: 'HOLD',
        asset: 'SPY',
        confidence: 'Medium',
        horizon: 'Tactical',
        why: ['Momentum remains mixed across sectors.', 'No clear regime break yet.'],
        invalidation: 'If SPY breaks below short-term support, shift to REDUCE.'
      }
    ];
  }, [state.alerts]);

  const watchlist = useMemo(
    () =>
      (state.watchlistSymbols || [])
        .slice(0, 5)
        .map((symbol) => String(symbol || '').toUpperCase())
        .map((symbol) => {
          const asset = assetsBySymbol[symbol];
          return {
            symbol,
            price: Number(asset?.price),
            change: Number(asset?.changePercent)
          };
        }),
    [state.watchlistSymbols, assetsBySymbol]
  );

  const triggers = useMemo(
    () =>
      actions
        .slice(0, 5)
        .map((card) => {
          if (card.action === 'BUY') return `If ${card.asset} confirms momentum continuation -> Build exposure`;
          if (card.action === 'SELL') return `If ${card.asset} loses support again -> Cut risk quickly`;
          if (card.action === 'REDUCE') return `If volatility spikes in ${card.asset} -> Reduce position size`;
          if (card.action === 'HEDGE') return `If cross-asset stress rises -> Add hedge`;
          return `If signal quality degrades in ${card.asset} -> Stay selective`;
        })
        .slice(0, 5),
    [actions]
  );

  useEffect(() => {
    let active = true;
    const fetchNews = async () => {
      setNewsError('');
      try {
        const out = await api.marketNewsRecommended({
          symbols: (state.watchlistSymbols || []).slice(0, 8),
          category: 'general',
          minScore: 10,
          limit: 5,
          maxAgeHours: 48,
          strictImpact: true
        });
        if (!active) return;
        const items = Array.isArray(out?.items) ? out.items.slice(0, 5) : [];
        setNewsItems(items);
      } catch {
        if (!active) return;
        setNewsError('No se pudieron cargar noticias de alto impacto.');
      }
    };
    fetchNews();
    return () => {
      active = false;
    };
  }, [state.watchlistSymbols]);

  const updatedLabel = state.lastUpdated
    ? new Date(state.lastUpdated).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Sin sincronización reciente';
  const currentRegime = useMemo(() => {
    const rows = (state.assets || []).filter((asset) => Number.isFinite(Number(asset.changePercent)));
    const advancers = rows.filter((asset) => Number(asset.changePercent) > 0).length;
    const breadth = rows.length ? (advancers / rows.length) * 100 : 50;
    const avg = rows.length ? rows.reduce((acc, asset) => acc + Number(asset.changePercent || 0), 0) / rows.length : 0;
    if (breadth >= 56 && avg > 0.2) return 'Risk On';
    if (breadth <= 44 && avg < -0.2) return 'Risk Off';
    return 'Mixed';
  }, [state.assets]);

  useEffect(() => {
    const dateKey = new Date().toISOString().slice(0, 10);
    const snapshot = {
      id: `${dateKey}-${mode}`,
      dateKey,
      mode,
      regime: currentRegime,
      createdAt: new Date().toISOString(),
      changed: changed.slice(0, 3).map((item) => item.text),
      actions: actions.slice(0, 3).map((item) => `ACTION ${item.action} ${item.asset} · ${item.confidence}`),
      triggers: triggers.slice(0, 3),
      headlines: newsItems.slice(0, 3).map((item) => item.headline || 'Market headline')
    };

    setBriefHistory((prev) => {
      const withoutCurrent = prev.filter((item) => item.id !== snapshot.id);
      const next = [snapshot, ...withoutCurrent].slice(0, 20);
      saveBriefHistory(next);
      return next;
    });
  }, [mode, currentRegime, changed, actions, triggers, newsItems]);

  const selectedHistory = useMemo(
    () => briefHistory.find((item) => item.id === selectedHistoryId) || null,
    [briefHistory, selectedHistoryId]
  );
  const selectedHistoryPrevious = useMemo(() => {
    if (!selectedHistory) return null;
    const idx = briefHistory.findIndex((item) => item.id === selectedHistory.id);
    if (idx < 0) return null;
    return briefHistory[idx + 1] || null;
  }, [briefHistory, selectedHistory]);
  const selectedHistoryDiff = useMemo(
    () => buildReplayDiff(selectedHistory, selectedHistoryPrevious),
    [selectedHistory, selectedHistoryPrevious]
  );
  const filteredHistory = useMemo(
    () => briefHistory.filter((item) => historyModeFilter === 'all' || String(item.mode || '') === historyModeFilter),
    [briefHistory, historyModeFilter]
  );
  const historyPageSize = 5;
  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const visibleHistory = useMemo(
    () => filteredHistory.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize),
    [filteredHistory, historyPage]
  );

  useEffect(() => {
    setHistoryPage(1);
    setSelectedHistoryId('');
  }, [historyModeFilter]);

  useEffect(() => {
    setHistoryPage((prev) => Math.min(prev, totalHistoryPages));
  }, [totalHistoryPages]);

  return (
    <div className="grid brief-page">
      <section className="card brief-header-card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2 className="screen-title">Tu resumen de hoy</h2>
            <div className="muted">Boosting Market Decisions</div>
          </div>
          <div className="brief-mode-toggle" role="tablist" aria-label="Mode">
            <button
              type="button"
              className={`brief-mode-btn ${mode === 'normal' ? 'is-active' : ''}`}
              onClick={() => setMode('normal')}
            >
              Normal mode
            </button>
            <button
              type="button"
              className={`brief-mode-btn ${mode === 'crisis' ? 'is-active is-crisis' : ''}`}
              onClick={() => setMode('crisis')}
            >
              Crisis mode
            </button>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>Actualizado: {updatedLabel}</div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Qué cambió</h3>
          <span className="badge">{changed.length}/6</span>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          {changed.slice(0, 6).map((item) => (
            <article key={item.id} className="brief-change-row">
              <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                <span className="badge">{item.tag}</span>
                <div className="brief-confidence-mini" aria-label={`Confidence ${item.confidence}`}>
                  <span style={{ width: `${Math.round(item.confidenceScore * 100)}%` }} />
                </div>
              </div>
              <div>{item.text}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Qué haría hoy</h3>
          <span className="badge">{actions.length}/5</span>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          {actions.slice(0, 5).map((card) => (
            <article key={card.id} className="brief-action-card">
              <div className="row">
                <strong>
                  ACTION: {card.action} {card.asset}
                </strong>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge">{card.confidence}</span>
                  <span className="badge">{card.horizon}</span>
                </div>
              </div>
              <ul className="brief-why-list">
                {card.why.slice(0, 2).map((point, idx) => (
                  <li key={`${card.id}-why-${idx}`}>{point}</li>
                ))}
              </ul>
              <div className="brief-invalidation">
                <strong>Invalidation trigger:</strong> {card.invalidation}
              </div>
              <button type="button" onClick={() => navigate('/agent')}>
                View Analysis
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Watchlist & Triggers</h3>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          <div className="brief-watchlist-grid">
            {watchlist.length ? (
              watchlist.map((item) => (
                <article key={item.symbol} className="brief-watch-item">
                  <strong>{item.symbol}</strong>
                  <div className="muted">{Number.isFinite(item.price) ? formatUSD(item.price) : '-'}</div>
                  <div className={`mono ${Number(item.change || 0) >= 0 ? 'up' : 'down'}`}>{formatPct(item.change || 0)}</div>
                </article>
              ))
            ) : (
              <div className="muted">No watchlist symbols yet.</div>
            )}
          </div>
          <div className="grid" style={{ gap: 6 }}>
            {triggers.map((trigger, idx) => (
              <div key={`trigger-${idx}`} className="brief-trigger-row">
                {trigger}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">High Impact News</h3>
          <span className="badge">{Math.min(newsItems.length, 5)}/5</span>
        </div>
        {newsError ? <div className="card" style={{ borderColor: '#FF4757AA', marginTop: 8 }}>{newsError}</div> : null}
        <div className="grid" style={{ marginTop: 8 }}>
          {!newsItems.length && !newsError ? <div className="muted">Loading high-impact news...</div> : null}
          {newsItems.slice(0, 5).map((item) => (
            <article key={item.id || item.url} className="brief-news-item">
              <div className="row">
                <strong>{item.headline || 'Market headline'}</strong>
                <span className="muted">{timeAgo(item.datetime)}</span>
              </div>
              <div className="muted">
                Why it matters: {item.aiReasons?.[0] || item.summary || 'Potential cross-asset repricing impact.'}
              </div>
              <div className="muted">
                Related asset/theme: {item.related || item.aiTheme || 'Global macro'}
              </div>
              {item.url ? (
                <button type="button" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>
                  Open Source
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Historial de briefs</h3>
          <span className="badge">{Math.min(filteredHistory.length, 20)}/20</span>
        </div>
        <div className="row" style={{ justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" className={`ai-filter-chip ${historyModeFilter === 'all' ? 'is-active is-main' : ''}`} onClick={() => setHistoryModeFilter('all')}>
            Todos
          </button>
          <button
            type="button"
            className={`ai-filter-chip ${historyModeFilter === 'normal' ? 'is-active is-main' : ''}`}
            onClick={() => setHistoryModeFilter('normal')}
          >
            Normal
          </button>
          <button
            type="button"
            className={`ai-filter-chip ${historyModeFilter === 'crisis' ? 'is-active is-main' : ''}`}
            onClick={() => setHistoryModeFilter('crisis')}
          >
            Crisis
          </button>
        </div>
        <div className="grid" style={{ marginTop: 8, gap: 6 }}>
          {visibleHistory.map((item) => (
            <article key={item.id} className="brief-history-item">
              <div className="row">
                <strong>{item.dateKey}</strong>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge">{item.mode}</span>
                  <button type="button" className="inline-link-btn" onClick={() => setSelectedHistoryId((prev) => (prev === item.id ? '' : item.id))}>
                    {selectedHistoryId === item.id ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-start', gap: 6 }}>
                <span className="badge">{item.regime || 'Mixed'}</span>
              </div>
              <div className="muted">
                {item.actions?.[0] || 'Sin acciones registradas.'}
              </div>
            </article>
          ))}
          {!filteredHistory.length ? <div className="muted">Sin historial de briefs para este filtro.</div> : null}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted">
            Página {historyPage} de {totalHistoryPages}
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))} disabled={historyPage <= 1}>
              Anterior
            </button>
            <button type="button" onClick={() => setHistoryPage((prev) => Math.min(totalHistoryPages, prev + 1))} disabled={historyPage >= totalHistoryPages}>
              Siguiente
            </button>
          </div>
        </div>
        {selectedHistory ? (
          <article className="brief-history-detail">
            <strong>Detalle {selectedHistory.dateKey}</strong>
            <div className="muted" style={{ marginTop: 6 }}>Qué cambió:</div>
            <ul className="brief-why-list">
              {(selectedHistory.changed || []).slice(0, 3).map((point, idx) => (
                <li key={`h-ch-${idx}`}>{point}</li>
              ))}
            </ul>
            <div className="muted">Qué haría:</div>
            <ul className="brief-why-list">
              {(selectedHistory.actions || []).slice(0, 3).map((point, idx) => (
                <li key={`h-ac-${idx}`}>{point}</li>
              ))}
            </ul>
            <div className="muted">Replay vs brief previo:</div>
            {selectedHistoryPrevious ? (
              <div className="grid" style={{ gap: 6 }}>
                <div className="brief-replay-row">
                  <strong>Nuevos cambios:</strong> {selectedHistoryDiff?.addedChanges?.length ? selectedHistoryDiff.addedChanges.join(' · ') : 'Sin cambios nuevos'}
                </div>
                <div className="brief-replay-row">
                  <strong>Cambios que salieron:</strong> {selectedHistoryDiff?.droppedChanges?.length ? selectedHistoryDiff.droppedChanges.join(' · ') : 'Sin salidas'}
                </div>
                <div className="brief-replay-row">
                  <strong>Nuevas acciones:</strong> {selectedHistoryDiff?.addedActions?.length ? selectedHistoryDiff.addedActions.join(' · ') : 'Sin acciones nuevas'}
                </div>
                <div className="brief-replay-row">
                  <strong>Acciones removidas:</strong> {selectedHistoryDiff?.droppedActions?.length ? selectedHistoryDiff.droppedActions.join(' · ') : 'Sin acciones removidas'}
                </div>
              </div>
            ) : (
              <div className="muted">No hay brief previo para comparar.</div>
            )}
          </article>
        ) : null}
      </section>
    </div>
  );
};

export default Brief;
