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

const toImpactMeta = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return { level: 'medium', topic: 'market' };
  const [levelPart, topicPart] = raw.split(':');
  return {
    level: levelPart === 'high' || levelPart === 'low' ? levelPart : 'medium',
    topic: topicPart || (levelPart === 'high' || levelPart === 'low' ? 'market' : levelPart) || 'market'
  };
};

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
        updated: 'Actualizado',
        marketMovers: 'Movimientos del mercado',
        waitingMarketData: 'Esperando datos del mercado...',
        noQuoteYet: 'Sin datos',
        noQuoteCompact: '–',
        ideaOfDay: 'Idea del día',
        action: 'ACCIÓN',
        invalidation: 'Disparador de invalidación',
        viewAnalysis: 'Ver análisis completo',
        watchlistTriggers: 'Lista de seguimiento y disparadores',
        noWatchlist: 'Todavía no hay símbolos en la lista de seguimiento.',
        highImpactNews: 'Noticias de alto impacto',
        loadingNews: 'Cargando noticias de alto impacto...',
        marketHeadline: 'Titular de mercado',
        whyItMatters: 'Por qué importa',
        related: 'Relacionado',
        openSource: 'Ver fuente',
        history: 'Historial',
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
        favorable: 'Favorable',
        defensive: 'Defensivo',
        calm: 'Calma',
        rising: 'En aumento',
        highUncertainty: 'Alta incertidumbre',
        confidenceHigh: 'Alta',
        confidenceMedium: 'Moderada',
        confidenceLow: 'Limitada',
        highImpact: 'Alto impacto',
        mediumImpact: 'Impacto medio',
        riskOn: 'Riesgo activo',
        riskOff: 'Riesgo defensivo',
        mixed: 'Mixto',
        syncLocale: 'es-AR'
      }
    : {
        title: 'Your daily brief',
        updated: 'Updated',
        marketMovers: 'Market Movers',
        waitingMarketData: 'Waiting for market data...',
        noQuoteYet: 'No quote',
        noQuoteCompact: '–',
        ideaOfDay: 'Idea of the day',
        action: 'ACTION',
        invalidation: 'Invalidation trigger',
        viewAnalysis: 'View full analysis',
        watchlistTriggers: 'Watchlist & Triggers',
        noWatchlist: 'No watchlist symbols yet.',
        highImpactNews: 'High Impact News',
        loadingNews: 'Loading high-impact news...',
        marketHeadline: 'Market headline',
        whyItMatters: 'Why it matters',
        related: 'Related',
        openSource: 'Read more',
        history: 'History',
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
        favorable: 'Favorable',
        defensive: 'Defensive',
        calm: 'Calm',
        rising: 'Rising',
        highUncertainty: 'High uncertainty',
        confidenceHigh: 'High',
        confidenceMedium: 'Moderate',
        confidenceLow: 'Limited',
        highImpact: 'High impact',
        mediumImpact: 'Medium impact',
        riskOn: 'Risk On',
        riskOff: 'Risk Off',
        mixed: 'Mixed',
        syncLocale: 'en-US'
      };
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
      .filter((asset) => {
        const change = Number(asset.changePercent);
        return Number.isFinite(change) && Math.abs(change) > 0;
      })
      .map((asset) => ({ ...asset, absChange: Math.abs(Number(asset.changePercent || 0)) }))
      .sort((a, b) => b.absChange - a.absChange)
      .slice(0, 6)
      .map((asset) => {
        const tag = CHANGE_TAG_BY_CATEGORY[String(asset.category || '').toLowerCase()] || 'Macro';
        const raw = Number(asset.changePercent || 0);
        const confidenceScore = Math.min(0.9, 0.42 + Math.min(0.45, Math.abs(raw) / 5));
        return {
          id: asset.symbol,
          tag,
          symbol: asset.symbol,
          change: raw,
          price: Number(asset.price),
          confidenceScore,
          confidence: scoreToConfidence(confidenceScore, isSpanish)
        };
      });
    return rows;
  }, [state.assets, isSpanish]);

  const showCategoryInMovers = useMemo(() => new Set(changed.map((item) => item.tag)).size > 1, [changed]);
  const moversMaxAbs = useMemo(
    () => changed.reduce((max, item) => Math.max(max, Math.abs(Number(item.change || 0))), 0),
    [changed]
  );

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
  const regimeState = useMemo(() => {
    const rows = (state.assets || []).filter((asset) => Number.isFinite(Number(asset.changePercent)));
    const avg = rows.length ? rows.reduce((acc, asset) => acc + Number(asset.changePercent || 0), 0) / rows.length : 0;
    if (avg >= 0.28) return 'favorable';
    if (avg <= -0.28) return 'defensive';
    return 'mixed';
  }, [state.assets]);
  const volatilityState = useMemo(() => {
    const rows = (state.assets || []).filter((asset) => Number.isFinite(Number(asset.changePercent)));
    const absAvg = rows.length ? rows.reduce((acc, asset) => acc + Math.abs(Number(asset.changePercent || 0)), 0) / rows.length : 0;
    if (absAvg >= 1.8) return 'high';
    if (absAvg >= 0.9) return 'rising';
    return 'calm';
  }, [state.assets]);
  const confidenceState = useMemo(() => {
    const avg = actions.length ? actions.reduce((acc, item) => acc + (CONFIDENCE_WEIGHT[String(item.confidence || '').toLowerCase()] || 0.5), 0) / actions.length : 0.5;
    if (avg >= 0.75) return 'high';
    if (avg >= 0.58) return 'medium';
    return 'low';
  }, [actions]);
  const mode = regimeState === 'defensive' || volatilityState === 'high' ? 'crisis' : 'normal';
  const regimeToneLabel = regimeState === 'favorable' ? t.favorable : regimeState === 'defensive' ? t.defensive : t.mixed;
  const volatilityLabel = volatilityState === 'calm' ? t.calm : volatilityState === 'rising' ? t.rising : t.highUncertainty;
  const confidenceLabel = confidenceState === 'high' ? t.confidenceHigh : confidenceState === 'medium' ? t.confidenceMedium : t.confidenceLow;

  useEffect(() => {
    const dateKey = new Date().toISOString().slice(0, 10);
    const snapshot = {
      id: `${dateKey}-${mode}`,
      dateKey,
      mode,
      regime: currentRegime,
      createdAt: new Date().toISOString(),
      changed: changed.slice(0, 3).map((item) => `${item.symbol} ${formatPct(item.change)}`),
      actions: actions.slice(0, 3).map((item) => `${item.action} ${item.asset} · ${item.confidence}`),
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
          </div>
        </div>
        <div className="brief-regime-pills">
          <span className={`brief-regime-pill ${regimeState === 'favorable' ? 'positive' : regimeState === 'defensive' ? 'negative' : 'warning'}`}>{regimeToneLabel}</span>
          <span className={`brief-regime-pill ${volatilityState === 'calm' ? 'positive' : volatilityState === 'rising' ? 'warning' : 'negative'}`}>{volatilityLabel}</span>
          <span className={`brief-regime-pill ${confidenceState === 'high' ? 'positive' : confidenceState === 'medium' ? 'warning' : 'negative'}`}>{confidenceLabel}</span>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>{t.updated}: {updatedLabel}</div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">{t.marketMovers}</h3>
          <span className="badge">{changed.length}/6</span>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          {!changed.length ? <div className="muted">{t.waitingMarketData}</div> : null}
          {changed.slice(0, 6).map((item) => (
            <article key={item.id} className="brief-change-row">
              <div className="row">
                <strong className="brief-mover-symbol mono">{item.symbol}</strong>
                <span className={`brief-mover-change mono ${item.change >= 0 ? 'up' : 'down'}`}>{formatPct(item.change)}</span>
              </div>
              <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                <span className="muted mono">{Number.isFinite(item.price) && item.price > 0 ? formatUSD(item.price) : t.noQuoteYet}</span>
                {showCategoryInMovers ? <span className="badge">{item.tag}</span> : null}
              </div>
              <div className="brief-mover-bar" aria-label={`Confidence ${item.confidence}`}>
                <span
                  style={{
                    width: `${Math.round(((Math.abs(item.change) || 0) / Math.max(moversMaxAbs, 0.01)) * 100)}%`
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">{t.ideaOfDay}</h3>
          <span className="badge">1/1</span>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          {actions.slice(0, 1).map((card) => (
            <article key={card.id} className={`brief-action-card action-${String(card.action || '').toLowerCase()}`}>
              <div className="row">
                <strong className="brief-action-head mono">{actionLabel(card.action, isSpanish)} {card.asset}</strong>
                <div className="row" style={{ gap: 6 }}>
                  <span className={`brief-tone-pill ${String(card.confidence || '').toLowerCase() === 'high' ? 'positive' : String(card.confidence || '').toLowerCase() === 'low' ? 'negative' : 'warning'}`}>
                    {card.confidence}
                  </span>
                  <span className="brief-tone-pill neutral">{card.horizon}</span>
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
              <button type="button" className="inline-link-btn brief-link-btn" onClick={() => navigate('/agent')}>{t.viewAnalysis} {'\u2192'}</button>
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
                  <div className="muted mono">{Number.isFinite(item.price) && item.price > 0 ? formatUSD(item.price) : t.noQuoteCompact}</div>
                  <div className={`mono ${Number.isFinite(item.change) && item.change !== 0 ? (Number(item.change || 0) >= 0 ? 'up' : 'down') : ''}`}>
                    {Number.isFinite(item.change) && item.change !== 0 ? formatPct(item.change || 0) : t.noQuoteCompact}
                  </div>
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
            <article key={item.id || item.url} className={`brief-news-item ${toImpactMeta(item.aiReasons?.[0]).level === 'high' ? 'impact-high' : 'impact-medium'}`}>
              {(() => {
                const impact = toImpactMeta(item.aiReasons?.[0]);
                return (
                  <>
                    <div className="row">
                      <strong className="brief-news-headline">{item.headline || t.marketHeadline}</strong>
                      <span className="muted mono brief-news-time">{timeAgo(item.datetime, isSpanish)}</span>
                    </div>
                    <div className="brief-news-tags">
                      <span className={`brief-tone-pill ${impact.level === 'high' ? 'negative' : 'warning'}`}>
                        {impact.level === 'high' ? t.highImpact : t.mediumImpact}
                      </span>
                      <span className="brief-tone-pill neutral">{impact.topic}</span>
                      <span className="brief-tone-pill neutral">{item.related || item.aiTheme || (isSpanish ? 'Macro global' : 'Global macro')}</span>
                    </div>
                  </>
                );
              })()}
              {item.url ? (
                <button type="button" className="inline-link-btn brief-link-btn" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>{t.openSource} {'\u2192'}</button>
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
                <strong>{new Date(item.createdAt || item.dateKey).toLocaleDateString(t.syncLocale, { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                <div className="row" style={{ gap: 6 }}>
                  <span className={`brief-tone-pill ${String(item.regime || '').toLowerCase().includes('risk') && String(item.regime || '').toLowerCase().includes('off') ? 'negative' : String(item.regime || '').toLowerCase().includes('risk') && String(item.regime || '').toLowerCase().includes('on') ? 'positive' : 'warning'}`}>
                    {item.regime || t.mixed}
                  </span>
                  <span className="brief-tone-pill neutral">{item.mode}</span>
                  <button type="button" className="inline-link-btn brief-link-btn" onClick={() => setSelectedHistoryId((prev) => (prev === item.id ? '' : item.id))}>
                    {selectedHistoryId === item.id ? t.hide : '->'}
                  </button>
                </div>
              </div>
              <div className="muted">
                {String(item.actions?.[0] || t.noActions).replace(/^ACTION\s+/i, '')}
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
