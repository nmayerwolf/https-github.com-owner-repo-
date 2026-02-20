import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useLanguage } from '../store/LanguageContext';

const scoreToConfidence = (score, isSpanish = false) => {
  const value = Number(score);
  if (!Number.isFinite(value)) return isSpanish ? 'Media' : 'Medium';
  if (value >= 0.74) return isSpanish ? 'Alta' : 'High';
  if (value >= 0.56) return isSpanish ? 'Media' : 'Medium';
  return isSpanish ? 'Baja' : 'Low';
};

const confidenceTone = (label = '') => {
  const key = String(label || '').toLowerCase();
  if (key === 'high' || key === 'alta') return 'positive';
  if (key === 'low' || key === 'baja') return 'negative';
  return 'warning';
};

const severityTone = (severity = '') => {
  const key = String(severity || '').toLowerCase();
  if (key === 'high') return 'negative';
  if (key === 'low') return 'neutral';
  return 'warning';
};

const severityLabel = (severity = '', isSpanish = false) => {
  const key = String(severity || '').toLowerCase();
  if (key === 'high') return isSpanish ? 'Alta' : 'High';
  if (key === 'low') return isSpanish ? 'Baja' : 'Low';
  return isSpanish ? 'Media' : 'Medium';
};

const timeframeLabel = (timeframe = '', isSpanish = false) => {
  const key = String(timeframe || '').toLowerCase();
  if (key === 'months') return isSpanish ? 'Meses' : 'Months';
  if (key === 'weeks') return isSpanish ? 'Semanas' : 'Weeks';
  return key || (isSpanish ? 'Táctico' : 'Tactical');
};

const Markets = () => {
  const { isSpanish } = useLanguage();
  const t = isSpanish
    ? {
        title: 'Ideas',
        subtitle: 'Alineadas con el régimen de mercado actual',
        strategic: 'Ideas estratégicas',
        opportunistic: 'Oportunistas',
        riskAlerts: 'Alertas de riesgo',
        loading: 'Cargando recomendaciones de hoy...',
        pending: 'Las recomendaciones de hoy estarán disponibles después del cierre (6:00 PM ET).',
        noIdeas: 'Sin ideas para esta sección.',
        confidence: 'Confianza',
        timeframe: 'Horizonte',
        invalidation: 'Invalidación',
        risks: 'Riesgos',
        tags: 'Tags',
        severity: 'Severidad',
        type: 'Tipo'
      }
    : {
        title: 'Ideas',
        subtitle: 'Aligned with the current market regime',
        strategic: 'Strategic Ideas',
        opportunistic: 'Opportunistic',
        riskAlerts: 'Risk Alerts',
        loading: "Loading today's recommendations...",
        pending: "Today's recommendations will be available after market close (6:00 PM ET).",
        noIdeas: 'No ideas in this section.',
        confidence: 'Confidence',
        timeframe: 'Timeframe',
        invalidation: 'Invalidation',
        risks: 'Risks',
        tags: 'Tags',
        severity: 'Severity',
        type: 'Type'
      };

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const out = await api.getRecoToday();
        if (!active) return;
        setPayload(out || null);
      } catch {
        if (!active) return;
        setPayload(null);
        setError(isSpanish ? 'No se pudieron cargar ideas.' : 'Could not load ideas.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [isSpanish]);

  const strategic = useMemo(() => (Array.isArray(payload?.sections?.strategic) ? payload.sections.strategic : []), [payload]);
  const opportunistic = useMemo(() => (Array.isArray(payload?.sections?.opportunistic) ? payload.sections.opportunistic : []), [payload]);
  const riskAlerts = useMemo(() => (Array.isArray(payload?.sections?.riskAlerts) ? payload.sections.riskAlerts : []), [payload]);
  const hasAnyItems = strategic.length > 0 || opportunistic.length > 0 || riskAlerts.length > 0;

  return (
    <div className="grid ideas-page">
      <section className="card ideas-header-card">
        <h2 className="screen-title">{t.title}</h2>
        <div className="muted">{t.subtitle}</div>
      </section>

      {loading ? <section className="card muted">{t.loading}</section> : null}
      {error ? <section className="card" style={{ borderColor: '#FF4757AA' }}>{error}</section> : null}
      {!loading && !error && !hasAnyItems ? <section className="card muted">{t.pending}</section> : null}

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">{t.strategic}</h3>
          <span className="badge">{strategic.length}</span>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          {!strategic.length ? <div className="muted">{t.noIdeas}</div> : null}
          {strategic.map((item) => {
            const confidence = scoreToConfidence(item.confidence, isSpanish);
            return (
              <article key={item.ideaId || `${item.symbol}-${item.action}`} className="ideas-card strategic">
                <div className="row">
                  <strong className="mono ideas-symbol">{item.symbol || 'Macro'}</strong>
                  <span className={`badge ${String(item.action || 'WATCH').toLowerCase() === 'buy' ? 'buy' : String(item.action || 'WATCH').toLowerCase() === 'sell' ? 'sell' : 'warning'}`}>
                    {item.action || 'WATCH'}
                  </span>
                </div>
                <div className="row" style={{ justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`brief-tone-pill ${confidenceTone(confidence)}`}>{t.confidence}: {confidence}</span>
                  <span className="brief-tone-pill neutral">{t.timeframe}: {timeframeLabel(item.timeframe, isSpanish)}</span>
                </div>
                <ul className="ideas-list ideas-list-rationale">
                  {(item.rationale || []).slice(0, 3).map((point, idx) => (
                    <li key={`${item.ideaId || item.symbol}-rt-${idx}`}>{point}</li>
                  ))}
                </ul>
                {item.invalidation ? (
                  <div className="ideas-invalidation">
                    <strong>{t.invalidation}:</strong> {item.invalidation}
                  </div>
                ) : null}
                {(item.risks || []).length ? (
                  <div className="ideas-risk-wrap">
                    <strong>{t.risks}</strong>
                    <ul className="ideas-list ideas-list-risk">
                      {(item.risks || []).slice(0, 2).map((risk, idx) => (
                        <li key={`${item.ideaId || item.symbol}-rk-${idx}`}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {(item.tags || []).length ? (
                  <div className="ideas-tags">
                    {(item.tags || []).slice(0, 4).map((tag, idx) => (
                      <span key={`${item.ideaId || item.symbol}-tg-${idx}`} className="brief-tone-pill neutral">{tag}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">{t.opportunistic}</h3>
          <span className="badge">{opportunistic.length}</span>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          {!opportunistic.length ? <div className="muted">{t.noIdeas}</div> : null}
          {opportunistic.map((item) => {
            const confidence = scoreToConfidence(item.confidence, isSpanish);
            return (
              <article key={item.ideaId || `${item.symbol}-${item.action}`} className="ideas-card opportunistic">
                <div className="row">
                  <strong className="mono ideas-symbol">{item.symbol || 'Macro'}</strong>
                  <div className="row" style={{ gap: 6 }}>
                    <span className={`badge ${String(item.action || 'WATCH').toLowerCase() === 'buy' ? 'buy' : String(item.action || 'WATCH').toLowerCase() === 'sell' ? 'sell' : 'warning'}`}>
                      {item.action || 'WATCH'}
                    </span>
                    {item.opportunisticType ? <span className="brief-tone-pill neutral">{item.opportunisticType}</span> : null}
                  </div>
                </div>
                <div className="row" style={{ justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`brief-tone-pill ${confidenceTone(confidence)}`}>{t.confidence}: {confidence}</span>
                  <span className="brief-tone-pill neutral">{t.timeframe}: {timeframeLabel(item.timeframe, isSpanish)}</span>
                </div>
                <ul className="ideas-list ideas-list-rationale">
                  {(item.rationale || []).slice(0, 3).map((point, idx) => (
                    <li key={`${item.ideaId || item.symbol}-rt-${idx}`}>{point}</li>
                  ))}
                </ul>
                {item.invalidation ? (
                  <div className="ideas-invalidation">
                    <strong>{t.invalidation}:</strong> {item.invalidation}
                  </div>
                ) : null}
                {(item.risks || []).length ? (
                  <div className="ideas-risk-wrap">
                    <strong>{t.risks}</strong>
                    <ul className="ideas-list ideas-list-risk">
                      {(item.risks || []).slice(0, 2).map((risk, idx) => (
                        <li key={`${item.ideaId || item.symbol}-rk-${idx}`}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {(item.tags || []).length ? (
                  <div className="ideas-tags">
                    {(item.tags || []).slice(0, 4).map((tag, idx) => (
                      <span key={`${item.ideaId || item.symbol}-tg-${idx}`} className="brief-tone-pill neutral">{tag}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">{t.riskAlerts}</h3>
          <span className="badge">{riskAlerts.length}</span>
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          {!riskAlerts.length ? <div className="muted">{t.noIdeas}</div> : null}
          {riskAlerts.map((item) => (
            <article key={item.ideaId || `${item.symbol}-${item.severity}`} className={`ideas-card risk severity-${severityTone(item.severity)}`}>
              <div className="row">
                <strong>{item.symbol || (isSpanish ? 'Alerta de mercado' : 'Market alert')}</strong>
                <span className={`brief-tone-pill ${severityTone(item.severity)}`}>{t.severity}: {severityLabel(item.severity, isSpanish)}</span>
              </div>
              {item.opportunisticType ? <div className="muted">{t.type}: {item.opportunisticType}</div> : null}
              <ul className="ideas-list ideas-list-rationale">
                {(item.rationale || []).slice(0, 3).map((point, idx) => (
                  <li key={`${item.ideaId || item.symbol}-rt-${idx}`}>{point}</li>
                ))}
              </ul>
              {(item.risks || []).length ? (
                <ul className="ideas-list ideas-list-risk">
                  {(item.risks || []).slice(0, 2).map((risk, idx) => (
                    <li key={`${item.ideaId || item.symbol}-rk-${idx}`}>{risk}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Markets;
