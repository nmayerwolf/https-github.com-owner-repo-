import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { useLanguage } from '../store/LanguageContext';
import { formatPct, formatUSD } from '../utils/format';
import GlobalContext from './GlobalContext';

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

const inferImpactFromText = (text = '') => {
  const raw = String(text || '').toLowerCase();
  if (/(risk|cae|fall|reces|tensión|stress|shock|widen|volatilidad alta|hawkish)/i.test(raw)) return 'RED';
  if (/(estable|mejora|sube|supportive|bull|upside|optimismo|compressing)/i.test(raw)) return 'GREEN';
  return 'YELLOW';
};

const inferCategoryFromText = (text = '') => {
  const raw = String(text || '').toLowerCase();
  if (/(war|guerra|taiwan|sanc|red sea|geopolit)/i.test(raw)) return 'GEOPOLITICS';
  if (/(tariff|arancel|trade|comercio)/i.test(raw)) return 'TARIFFS';
  if (/(fed|ecb|boj|rates|tasas|central bank)/i.test(raw)) return 'CENTRAL_BANKS';
  if (/(oil|wti|opec|gas|energy|energía)/i.test(raw)) return 'ENERGY';
  if (/(gold|copper|silver|xau|metal)/i.test(raw)) return 'METALS';
  if (/(commodit|grain|agro)/i.test(raw)) return 'COMMODITIES';
  if (/(inflation|cpi|pmi|nfp|jobs|macro|gdp)/i.test(raw)) return 'MACRO_DATA';
  if (/(bitcoin|btc|eth|crypto)/i.test(raw)) return 'CRYPTO';
  if (/(ai|semiconductor|nvda|hyperscaler)/i.test(raw)) return 'AI';
  if (/(earnings|m&a|corporat)/i.test(raw)) return 'CORPORATE';
  return 'EQUITIES';
};

const Brief = () => {
  const navigate = useNavigate();
  const { state } = useApp();
  const { isSpanish } = useLanguage();
  const t = isSpanish
    ? {
        title: 'Tu resumen de hoy',
        globalContext: '🌍 Global Context',
        loadingContext: 'Armando contexto global...',
        pendingContext: 'Global context estará disponible después del cierre.',
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
        globalContext: '🌍 Global Context',
        loadingContext: 'Building global context...',
        pendingContext: 'Global context will be available after market close.',
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
  const [globalContextItems, setGlobalContextItems] = useState([]);
  const [globalContextLoading, setGlobalContextLoading] = useState(false);
  const [globalContextError, setGlobalContextError] = useState('');

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

  const watchlistSymbols = useMemo(() => (state.watchlistSymbols || []).slice(0, 8), [state.watchlistSymbols]);

  useEffect(() => {
    let active = true;
    const fetchGlobalContext = async () => {
      setGlobalContextLoading(true);
      setGlobalContextError('');
      try {
        const digest = typeof api.getNewsDigestToday === 'function' ? await api.getNewsDigestToday() : null;
        if (!active) return;
        const raw = Array.isArray(digest?.global_context) ? digest.global_context : [];
        if (raw.length) {
          setGlobalContextItems(
            raw
              .map((item) => ({
                category: String(item?.category || '').toUpperCase(),
                impact: String(item?.impact || '').toUpperCase(),
                text: String(item?.text || '').trim()
              }))
              .filter((item) => item.text)
              .slice(0, 8)
          );
          return;
        }

        const fallbackBullets = (Array.isArray(digest?.bullets) ? digest.bullets : [])
          .map((line) => String(line || '').replace(/\[|\]/g, ''))
          .map((line) => line.split(/\s*(?:->|→)\s*/).map((part) => part.trim()).filter(Boolean))
          .filter((parts) => parts.length > 0)
          .map((parts) => {
            const text = parts.join('. ');
            return {
              category: inferCategoryFromText(text),
              impact: inferImpactFromText(text),
              text
            };
          })
          .slice(0, 8);
        setGlobalContextItems(fallbackBullets);
      } catch {
        if (!active) return;
        setGlobalContextItems([]);
        setGlobalContextError(isSpanish ? 'No se pudo cargar el contexto global.' : 'Could not load global context.');
      } finally {
        if (active) setGlobalContextLoading(false);
      }
    };
    fetchGlobalContext();
    return () => {
      active = false;
    };
  }, [isSpanish]);

  useEffect(() => {
    let active = true;
    const fetchNews = async () => {
      setNewsError('');
      try {
        const out = await api.marketNewsRecommended({
          symbols: watchlistSymbols,
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
  }, [watchlistSymbols, isSpanish]);

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
  const regimeToneLabel = regimeState === 'favorable' ? t.favorable : regimeState === 'defensive' ? t.defensive : t.mixed;
  const volatilityLabel = volatilityState === 'calm' ? t.calm : volatilityState === 'rising' ? t.rising : t.highUncertainty;
  const confidenceLabel = confidenceState === 'high' ? t.confidenceHigh : confidenceState === 'medium' ? t.confidenceMedium : t.confidenceLow;

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
      </section>

      <GlobalContext
        title={t.globalContext}
        loadingLabel={t.loadingContext}
        pendingLabel={t.pendingContext}
        items={globalContextItems}
        loading={globalContextLoading}
        error={globalContextError}
        isSpanish={isSpanish}
      />

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

    </div>
  );
};

export default Brief;
