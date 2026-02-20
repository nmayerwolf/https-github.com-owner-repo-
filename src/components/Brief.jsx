import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { useLanguage } from '../store/LanguageContext';
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

const confidenceToLabel = (value, isSpanish = false) => {
  const key = String(value || '').toLowerCase();
  if (key === 'high') return isSpanish ? 'Alta' : 'High';
  if (key === 'low') return isSpanish ? 'Baja' : 'Low';
  return isSpanish ? 'Media' : 'Medium';
};

const scoreToConfidence = (score, isSpanish = false) => {
  if (score >= 0.74) return isSpanish ? 'Alta' : 'High';
  if (score >= 0.56) return isSpanish ? 'Media' : 'Medium';
  return isSpanish ? 'Baja' : 'Low';
};

const actionLabel = (raw, isSpanish = false) => {
  const key = String(raw || '').toUpperCase();
  if (!isSpanish) return key;
  if (key === 'BUY') return 'COMPRA';
  if (key === 'SELL') return 'VENTA';
  if (key === 'REDUCE') return 'REDUCIR';
  if (key === 'HOLD') return 'MANTENER';
  if (key === 'HEDGE') return 'COBERTURA';
  return key;
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

const timeAgo = (value, isSpanish = false) => {
  const ts = toUnixSeconds(value);
  if (!ts) return isSpanish ? 'hace un momento' : 'just now';
  const diffMin = Math.max(1, Math.floor((Date.now() / 1000 - ts) / 60));
  if (diffMin < 60) return isSpanish ? `hace ${diffMin}m` : `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return isSpanish ? `hace ${hours}h` : `${hours}h ago`;
  return isSpanish ? `hace ${Math.floor(hours / 24)}d` : `${Math.floor(hours / 24)}d ago`;
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
  const { isSpanish } = useLanguage();
  const t = isSpanish
    ? {
        title: 'Tu resumen de hoy',
        subtitle: 'Impulsando decisiones de mercado',
        normalMode: 'Modo normal',
        crisisMode: 'Modo crisis',
        updated: 'Actualizado',
        changed: 'Qué cambió',
        doToday: 'Qué haría hoy',
        action: 'ACCIÓN',
        invalidation: 'Disparador de invalidación',
        viewAnalysis: 'Ver análisis',
        watchlistTriggers: 'Lista de seguimiento y disparadores',
        noWatchlist: 'Todavía no hay símbolos en la lista de seguimiento.',
        highImpactNews: 'Noticias de alto impacto',
        loadingNews: 'Cargando noticias de alto impacto...',
        marketHeadline: 'Titular de mercado',
        whyItMatters: 'Por qué importa',
        related: 'Activo/tema relacionado',
        openSource: 'Abrir fuente',
        history: 'Historial de resúmenes',
        all: 'Todos',
        normal: 'Normal',
        crisis: 'Crisis',
        hide: 'Ocultar',
        view: 'Ver',
        noActions: 'Sin acciones registradas.',
        noHistory: 'Sin historial de briefs para este filtro.',
        page: 'Página',
        of: 'de',
        prev: 'Anterior',
        next: 'Siguiente',
        detail: 'Detalle',
        replayVsPrevious: 'Comparación vs resumen previo',
        newChanges: 'Nuevos cambios',
        droppedChanges: 'Cambios que salieron',
        newActions: 'Nuevas acciones',
        removedActions: 'Acciones removidas',
        noNewChanges: 'Sin cambios nuevos',
        noDropped: 'Sin salidas',
        noNewActions: 'Sin acciones nuevas',
        noRemovedActions: 'Sin acciones removidas',
        noPrevious: 'No hay brief previo para comparar.',
        changedLabel: 'Qué cambió',
        doLabel: 'Qué haría',
        riskOn: 'Riesgo activo',
        riskOff: 'Riesgo defensivo',
        mixed: 'Mixto',
        syncLocale: 'es-AR'
      }
    : {
        title: 'Your daily brief',
        subtitle: 'Boosting market decisions',
        normalMode: 'Normal mode',
        crisisMode: 'Crisis mode',
        updated: 'Updated',
        changed: 'What changed',
        doToday: 'What I would do today',
        action: 'ACTION',
        invalidation: 'Invalidation trigger',
        viewAnalysis: 'View analysis',
        watchlistTriggers: 'Watchlist & Triggers',
        noWatchlist: 'No watchlist symbols yet.',
        highImpactNews: 'High Impact News',
        loadingNews: 'Loading high-impact news...',
        marketHeadline: 'Market headline',
        whyItMatters: 'Why it matters',
        related: 'Related asset/theme',
        openSource: 'Open Source',
        history: 'Brief history',
        all: 'All',
        normal: 'Normal',
        crisis: 'Crisis',
        hide: 'Hide',
        view: 'View',
        noActions: 'No actions logged.',
        noHistory: 'No brief history for this filter.',
        page: 'Page',
        of: 'of',
        prev: 'Previous',
        next: 'Next',
        detail: 'Detail',
        replayVsPrevious: 'Replay vs previous brief',
        newChanges: 'New changes',
        droppedChanges: 'Dropped changes',
        newActions: 'New actions',
        removedActions: 'Removed actions',
        noNewChanges: 'No new changes',
        noDropped: 'No dropped changes',
        noNewActions: 'No new actions',
        noRemovedActions: 'No removed actions',
        noPrevious: 'No previous brief to compare.',
        changedLabel: 'What changed',
        doLabel: 'What I would do',
        riskOn: 'Risk On',
        riskOff: 'Risk Off',
        mixed: 'Mixed',
        syncLocale: 'en-US'
      };
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
        const direction = raw >= 0 ? (isSpanish ? 'alcista' : 'rising') : isSpanish ? 'debilitándose' : 'weakening';
        const confidenceScore = Math.min(0.9, 0.45 + Math.min(0.4, Math.abs(raw) / 6));
        return {
          id: asset.symbol,
          tag,
          text: `${asset.symbol} ${isSpanish ? 'impulso' : 'momentum'} ${direction} (${formatPct(raw)})`,
          confidenceScore,
          confidence: scoreToConfidence(confidenceScore, isSpanish)
        };
      });

    if (rows.length) return rows;
    return [
      { id: 'fallback-1', tag: 'Macro', text: isSpanish ? 'Sube la volatilidad en acciones de EE.UU.' : 'Volatility rising in US equities', confidenceScore: 0.58, confidence: 'Medium' },
      { id: 'fallback-2', tag: 'Rates', text: isSpanish ? 'Se endurece la liquidez en tasas cortas.' : 'Liquidity tightening in short-term rates', confidenceScore: 0.54, confidence: 'Low' },
      { id: 'fallback-3', tag: 'Crypto', text: isSpanish ? 'BTC pierde impulso.' : 'BTC momentum weakening', confidenceScore: 0.64, confidence: 'Medium' }
    ];
  }, [state.assets, isSpanish]);

  const actions = useMemo(() => {
    const cards = (state.alerts || [])
      .slice(0, 5)
      .map((alert, idx) => {
        const type = String(alert.type || '').toLowerCase();
        const action = ACTION_BY_TYPE[type] || 'HOLD';
        const confidenceRaw = String(alert.confidence || 'medium').toLowerCase();
        const confidence = confidenceToLabel(confidenceRaw, isSpanish);
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
          ? isSpanish
            ? `Si ${symbol} < ${formatUSD(Number(alert.stopLoss))}, invalidar y reducir exposición.`
            : `If ${symbol} < ${formatUSD(Number(alert.stopLoss))}, invalidate and reduce exposure.`
          : Number.isFinite(Number(alert.takeProfit))
            ? isSpanish
              ? `Si ${symbol} > ${formatUSD(Number(alert.takeProfit))}, asegurar ganancias y reevaluar.`
              : `If ${symbol} > ${formatUSD(Number(alert.takeProfit))}, lock gains and reassess.`
            : isSpanish
              ? 'Si la confluencia se gira contra la tesis en la próxima sesión, reducir riesgo.'
              : 'If confluence turns against thesis in the next session, reduce risk.';
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
        why: [
          isSpanish ? 'El momentum sigue mixto entre sectores.' : 'Momentum remains mixed across sectors.',
          isSpanish ? 'Todavía no hay ruptura clara de régimen.' : 'No clear regime break yet.'
        ],
        invalidation: isSpanish ? 'Si SPY rompe soporte de corto plazo, pasar a REDUCE.' : 'If SPY breaks below short-term support, shift to REDUCE.'
      }
    ];
  }, [state.alerts, isSpanish]);

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
          if (card.action === 'BUY') return isSpanish ? `Si ${card.asset} confirma continuidad de momentum -> Construir exposición` : `If ${card.asset} confirms momentum continuation -> Build exposure`;
          if (card.action === 'SELL') return isSpanish ? `Si ${card.asset} pierde soporte otra vez -> Cortar riesgo rápido` : `If ${card.asset} loses support again -> Cut risk quickly`;
          if (card.action === 'REDUCE') return isSpanish ? `Si sube volatilidad en ${card.asset} -> Reducir tamaño` : `If volatility spikes in ${card.asset} -> Reduce position size`;
          if (card.action === 'HEDGE') return isSpanish ? 'Si sube el estrés cross-asset -> Agregar cobertura' : 'If cross-asset stress rises -> Add hedge';
          return isSpanish ? `Si baja la calidad de señal en ${card.asset} -> Mantener selectividad` : `If signal quality degrades in ${card.asset} -> Stay selective`;
        })
        .slice(0, 5),
    [actions, isSpanish]
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
        setNewsError(isSpanish ? 'No se pudieron cargar noticias de alto impacto.' : 'Could not load high-impact news.');
      }
    };
    fetchNews();
    return () => {
      active = false;
    };
  }, [state.watchlistSymbols, isSpanish]);

  const updatedLabel = state.lastUpdated
    ? new Date(state.lastUpdated).toLocaleString(t.syncLocale, { dateStyle: 'medium', timeStyle: 'short' })
    : isSpanish ? 'Sin sincronización reciente' : 'No recent sync';
  const currentRegime = useMemo(() => {
    const rows = (state.assets || []).filter((asset) => Number.isFinite(Number(asset.changePercent)));
    const advancers = rows.filter((asset) => Number(asset.changePercent) > 0).length;
    const breadth = rows.length ? (advancers / rows.length) * 100 : 50;
    const avg = rows.length ? rows.reduce((acc, asset) => acc + Number(asset.changePercent || 0), 0) / rows.length : 0;
    if (breadth >= 56 && avg > 0.2) return t.riskOn;
    if (breadth <= 44 && avg < -0.2) return t.riskOff;
    return t.mixed;
  }, [state.assets, t.riskOn, t.riskOff, t.mixed]);

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
            <h2 className="screen-title">{t.title}</h2>
            <div className="muted">{t.subtitle}</div>
          </div>
          <div className="brief-mode-toggle" role="tablist" aria-label="Mode">
            <button
              type="button"
              className={`brief-mode-btn ${mode === 'normal' ? 'is-active' : ''}`}
              onClick={() => setMode('normal')}
            >
              {t.normalMode}
            </button>
            <button
              type="button"
              className={`brief-mode-btn ${mode === 'crisis' ? 'is-active is-crisis' : ''}`}
              onClick={() => setMode('crisis')}
            >
              {t.crisisMode}
            </button>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>{t.updated}: {updatedLabel}</div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">{t.changed}</h3>
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
          <h3 className="section-title">{t.doToday}</h3>
          <span className="badge">{actions.length}/5</span>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          {actions.slice(0, 5).map((card) => (
            <article key={card.id} className="brief-action-card">
              <div className="row">
                <strong>
                  {t.action}: {actionLabel(card.action, isSpanish)} {card.asset}
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
                <strong>{t.invalidation}:</strong> {card.invalidation}
              </div>
              <button type="button" onClick={() => navigate('/agent')}>
                {t.viewAnalysis}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">{t.watchlistTriggers}</h3>
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
              <div className="muted">{t.noWatchlist}</div>
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
          <h3 className="section-title">{t.highImpactNews}</h3>
          <span className="badge">{Math.min(newsItems.length, 5)}/5</span>
        </div>
        {newsError ? <div className="card" style={{ borderColor: '#FF4757AA', marginTop: 8 }}>{newsError}</div> : null}
        <div className="grid" style={{ marginTop: 8 }}>
          {!newsItems.length && !newsError ? <div className="muted">{t.loadingNews}</div> : null}
          {newsItems.slice(0, 5).map((item) => (
            <article key={item.id || item.url} className="brief-news-item">
              <div className="row">
                <strong>{item.headline || t.marketHeadline}</strong>
                <span className="muted">{timeAgo(item.datetime, isSpanish)}</span>
              </div>
              <div className="muted">
                {t.whyItMatters}: {item.aiReasons?.[0] || item.summary || (isSpanish ? 'Posible impacto de repricing cross-asset.' : 'Potential cross-asset repricing impact.')}
              </div>
              <div className="muted">
                {t.related}: {item.related || item.aiTheme || (isSpanish ? 'Macro global' : 'Global macro')}
              </div>
              {item.url ? (
                <button type="button" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>
                  {t.openSource}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">{t.history}</h3>
          <span className="badge">{Math.min(filteredHistory.length, 20)}/20</span>
        </div>
        <div className="row" style={{ justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" className={`ai-filter-chip ${historyModeFilter === 'all' ? 'is-active is-main' : ''}`} onClick={() => setHistoryModeFilter('all')}>
            {t.all}
          </button>
          <button
            type="button"
            className={`ai-filter-chip ${historyModeFilter === 'normal' ? 'is-active is-main' : ''}`}
            onClick={() => setHistoryModeFilter('normal')}
          >
            {t.normal}
          </button>
          <button
            type="button"
            className={`ai-filter-chip ${historyModeFilter === 'crisis' ? 'is-active is-main' : ''}`}
            onClick={() => setHistoryModeFilter('crisis')}
          >
            {t.crisis}
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
                    {selectedHistoryId === item.id ? t.hide : t.view}
                  </button>
                </div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-start', gap: 6 }}>
                <span className="badge">{item.regime || t.mixed}</span>
              </div>
              <div className="muted">
                {item.actions?.[0] || t.noActions}
              </div>
            </article>
          ))}
          {!filteredHistory.length ? <div className="muted">{t.noHistory}</div> : null}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted">
            {t.page} {historyPage} {t.of} {totalHistoryPages}
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))} disabled={historyPage <= 1}>
              {t.prev}
            </button>
            <button type="button" onClick={() => setHistoryPage((prev) => Math.min(totalHistoryPages, prev + 1))} disabled={historyPage >= totalHistoryPages}>
              {t.next}
            </button>
          </div>
        </div>
        {selectedHistory ? (
          <article className="brief-history-detail">
            <strong>{t.detail} {selectedHistory.dateKey}</strong>
            <div className="muted" style={{ marginTop: 6 }}>{t.changedLabel}:</div>
            <ul className="brief-why-list">
              {(selectedHistory.changed || []).slice(0, 3).map((point, idx) => (
                <li key={`h-ch-${idx}`}>{point}</li>
              ))}
            </ul>
            <div className="muted">{t.doLabel}:</div>
            <ul className="brief-why-list">
              {(selectedHistory.actions || []).slice(0, 3).map((point, idx) => (
                <li key={`h-ac-${idx}`}>{point}</li>
              ))}
            </ul>
            <div className="muted">{t.replayVsPrevious}:</div>
            {selectedHistoryPrevious ? (
              <div className="grid" style={{ gap: 6 }}>
                <div className="brief-replay-row">
                  <strong>{t.newChanges}:</strong> {selectedHistoryDiff?.addedChanges?.length ? selectedHistoryDiff.addedChanges.join(' · ') : t.noNewChanges}
                </div>
                <div className="brief-replay-row">
                  <strong>{t.droppedChanges}:</strong> {selectedHistoryDiff?.droppedChanges?.length ? selectedHistoryDiff.droppedChanges.join(' · ') : t.noDropped}
                </div>
                <div className="brief-replay-row">
                  <strong>{t.newActions}:</strong> {selectedHistoryDiff?.addedActions?.length ? selectedHistoryDiff.addedActions.join(' · ') : t.noNewActions}
                </div>
                <div className="brief-replay-row">
                  <strong>{t.removedActions}:</strong> {selectedHistoryDiff?.droppedActions?.length ? selectedHistoryDiff.droppedActions.join(' · ') : t.noRemovedActions}
                </div>
              </div>
            ) : (
              <div className="muted">{t.noPrevious}</div>
            )}
          </article>
        ) : null}
      </section>
    </div>
  );
};

export default Brief;
