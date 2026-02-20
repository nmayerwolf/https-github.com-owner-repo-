import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import IdeaCard from './IdeaCard';
import RiskCard from './RiskCard';

const fmtDate = (isoDate) => {
  const date = isoDate ? new Date(`${isoDate}T12:00:00`) : new Date();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const Section = ({ title, subtitle, count, open, onToggle, children }) => (
  <section className="card">
    <button type="button" className="section-collapse-btn" onClick={onToggle}>
      <div>
        <h3 className="section-title">
          {title} <span className="muted mono">[{count}]</span>
        </h3>
        <div className="muted">{subtitle}</div>
      </div>
      <span className="mono">{open ? '▾' : '▸'}</span>
    </button>
    {open ? <div className="grid" style={{ marginTop: 8 }}>{children}</div> : null}
  </section>
);

const Ideas = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reco, setReco] = useState(null);
  const [expanded, setExpanded] = useState({ strategic: true, opportunistic: true, risk: true });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.getRecoToday();
      setReco(out || null);
    } catch {
      setError('Could not load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const strategic = useMemo(() => (Array.isArray(reco?.strategic) ? reco.strategic : []), [reco]);
  const opportunistic = useMemo(() => (Array.isArray(reco?.opportunistic) ? reco.opportunistic : []), [reco]);
  const riskAlerts = useMemo(() => (Array.isArray(reco?.risk_alerts) ? reco.risk_alerts : []), [reco]);
  const pending = Boolean(reco?.pending);

  return (
    <div className="grid">
      <section className="card">
        <h2 className="screen-title">Ideas</h2>
        <div className="mono muted">{fmtDate(reco?.date)}</div>
      </section>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <span className="muted">Loading...</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="error-state">
          <span className="muted">
            Could not load data. <button type="button" onClick={load}>Retry</button>
          </span>
        </div>
      ) : null}

      {!loading && !error && pending ? <section className="news-pending-state">Today's ideas will be available after market close.</section> : null}

      {!loading && !error && !pending ? (
        <>
          <Section
            title="Strategic Ideas"
            subtitle="Aligned with current market regime"
            count={strategic.length}
            open={expanded.strategic}
            onToggle={() => setExpanded((prev) => ({ ...prev, strategic: !prev.strategic }))}
          >
            {strategic.length ? strategic.map((item) => <IdeaCard key={item.ideaId || `${item.symbol}-${item.action}`} item={item} variant="strategic" />) : <div className="muted">No strategic ideas today.</div>}
          </Section>

          <Section
            title="Opportunistic"
            subtitle="Short-term setups with clear triggers"
            count={opportunistic.length}
            open={expanded.opportunistic}
            onToggle={() => setExpanded((prev) => ({ ...prev, opportunistic: !prev.opportunistic }))}
          >
            {opportunistic.length ? opportunistic.map((item) => <IdeaCard key={item.ideaId || `${item.symbol}-${item.action}`} item={item} variant="opportunistic" />) : <div className="muted">No opportunistic ideas today.</div>}
          </Section>

          <Section
            title="Risk Alerts"
            subtitle="Active risks to monitor"
            count={riskAlerts.length}
            open={expanded.risk}
            onToggle={() => setExpanded((prev) => ({ ...prev, risk: !prev.risk }))}
          >
            {riskAlerts.length ? riskAlerts.map((alert, idx) => <RiskCard key={`${alert.title || 'risk'}-${idx}`} alert={alert} />) : <div className="muted">No active risk alerts.</div>}
          </Section>
        </>
      ) : null}
    </div>
  );
};

export default Ideas;
