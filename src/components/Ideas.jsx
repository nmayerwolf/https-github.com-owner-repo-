import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';

const confidenceLabel = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Limited';
  if (n >= 0.75) return 'High';
  if (n >= 0.55) return 'Moderate';
  return 'Limited';
};

const actionText = (item = {}) => {
  const action = String(item.action || 'WATCH').toUpperCase();
  const symbol = item.symbol ? ` ${String(item.symbol).toUpperCase()}` : '';
  const timeframe = item.timeframe ? ` (${item.timeframe})` : '';
  return `${action}${symbol}${timeframe}`;
};

const IdeaCard = ({ item }) => (
  <article className="card">
    <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
      <strong>{item.symbol ? String(item.symbol).toUpperCase() : item.ideaId || 'Idea'}</strong>
      <span className="badge" style={{ background: '#8CC8FF22', color: '#8CC8FF' }}>
        Confidence: {confidenceLabel(item.confidence)}
      </span>
    </div>
    <div className="muted" style={{ marginTop: 8 }}>
      <strong>Diagnosis:</strong> {Array.isArray(item.rationale) && item.rationale.length ? item.rationale[0] : 'Sin diagnóstico detallado.'}
    </div>
    <div className="muted" style={{ marginTop: 6 }}>
      <strong>Risk/impact:</strong> {Array.isArray(item.risks) && item.risks.length ? item.risks[0] : 'Sin riesgo material adicional reportado.'}
    </div>
    <div className="muted" style={{ marginTop: 6 }}>
      <strong>Concrete adjustment:</strong> {actionText(item)}
      {item.invalidation ? ` · Invalidation: ${item.invalidation}` : ''}
    </div>
  </article>
);

const Ideas = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reco, setReco] = useState(null);
  const [crisis, setCrisis] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [recoOut, crisisOut] = await Promise.all([
          typeof api.getRecoToday === 'function' ? api.getRecoToday() : Promise.resolve(null),
          typeof api.getCrisisToday === 'function' ? api.getCrisisToday() : Promise.resolve(null)
        ]);
        if (!active) return;
        setReco(recoOut || null);
        setCrisis(crisisOut || null);
      } catch {
        if (!active) return;
        setError('No se pudo cargar Ideas.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const strategic = useMemo(() => (Array.isArray(reco?.sections?.strategic) ? reco.sections.strategic : []), [reco]);
  const opportunistic = useMemo(() => (Array.isArray(reco?.sections?.opportunistic) ? reco.sections.opportunistic : []), [reco]);
  const riskAlerts = useMemo(() => (Array.isArray(reco?.sections?.riskAlerts) ? reco.sections.riskAlerts : []), [reco]);

  return (
    <div className="grid">
      <section className="card">
        <div className="section-header-inline">
          <h2 className="screen-title">Ideas</h2>
        </div>
        {crisis ? (
          <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge" style={{ background: crisis.isActive ? '#FF6B6B22' : '#00E08E22', color: crisis.isActive ? '#FF6B6B' : '#00E08E' }}>
              {crisis.isActive ? 'High Volatility Environment' : 'Normal Market Environment'}
            </span>
            <span className="muted">{crisis.summary}</span>
          </div>
        ) : null}
      </section>

      {loading ? <section className="card muted">Cargando ideas diarias...</section> : null}
      {error ? <section className="card" style={{ borderColor: '#FF4757AA' }}>{error}</section> : null}

      {!loading && !error ? (
        <>
          <section className="card">
            <h3 className="section-title">Strategic Ideas</h3>
            <div className="grid" style={{ marginTop: 8 }}>
              {strategic.map((item) => (
                <IdeaCard key={item.ideaId || `${item.symbol}-${item.action}`} item={item} />
              ))}
              {!strategic.length ? <div className="muted">Sin ideas estratégicas para hoy.</div> : null}
            </div>
          </section>

          <section className="card">
            <h3 className="section-title">Opportunistic Ideas</h3>
            <div className="grid" style={{ marginTop: 8 }}>
              {opportunistic.map((item) => (
                <IdeaCard key={item.ideaId || `${item.symbol}-${item.action}`} item={item} />
              ))}
              {!opportunistic.length ? <div className="muted">Sin ideas oportunísticas para hoy.</div> : null}
            </div>
          </section>

          <section className="card">
            <h3 className="section-title">Risk Alerts</h3>
            <div className="grid" style={{ marginTop: 8 }}>
              {riskAlerts.map((item) => (
                <IdeaCard key={item.ideaId || `${item.symbol}-${item.action}`} item={item} />
              ))}
              {!riskAlerts.length ? <div className="muted">Sin alertas de riesgo activas.</div> : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
};

export default Ideas;
