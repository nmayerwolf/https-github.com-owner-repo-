import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import IdeaCard from './IdeaCard';
import RiskCard from './RiskCard';
import { useTranslation } from '../i18n/useTranslation';

const fmtDate = (isoDate, locale = 'en-US') => {
  const date = isoDate ? new Date(`${isoDate}T12:00:00`) : new Date();
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
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
  const { t, language } = useTranslation();
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
  const locale = language === 'en' ? 'en-US' : 'es-AR';

  return (
    <div className="grid">
      <section className="card">
        <h2 className="screen-title">{t('ideas_title')}</h2>
        <div className="mono muted">{fmtDate(reco?.date, locale)}</div>
      </section>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <span className="muted">{t('common_loading')}</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="error-state">
          <span className="muted">
            {t('common_error')} <button type="button" onClick={load}>{t('common_retry')}</button>
          </span>
        </div>
      ) : null}

      {!loading && !error && pending ? <section className="news-pending-state">{t('ideas_pending')}</section> : null}

      {!loading && !error && !pending ? (
        <>
          <Section
            title={t('ideas_strategic')}
            subtitle={t('ideas_strategic_sub')}
            count={strategic.length}
            open={expanded.strategic}
            onToggle={() => setExpanded((prev) => ({ ...prev, strategic: !prev.strategic }))}
          >
            {strategic.length ? strategic.map((item) => <IdeaCard key={item.ideaId || `${item.symbol}-${item.action}`} item={item} variant="strategic" />) : <div className="muted">{t('ideas_no_strategic')}</div>}
          </Section>

          <Section
            title={t('ideas_opportunistic')}
            subtitle={t('ideas_opportunistic_sub')}
            count={opportunistic.length}
            open={expanded.opportunistic}
            onToggle={() => setExpanded((prev) => ({ ...prev, opportunistic: !prev.opportunistic }))}
          >
            {opportunistic.length ? opportunistic.map((item) => <IdeaCard key={item.ideaId || `${item.symbol}-${item.action}`} item={item} variant="opportunistic" />) : <div className="muted">{t('ideas_no_opportunistic')}</div>}
          </Section>

          <Section
            title={t('ideas_risk_alerts')}
            subtitle={t('ideas_risk_alerts_sub')}
            count={riskAlerts.length}
            open={expanded.risk}
            onToggle={() => setExpanded((prev) => ({ ...prev, risk: !prev.risk }))}
          >
            {riskAlerts.length ? riskAlerts.map((alert, idx) => <RiskCard key={`${alert.title || 'risk'}-${idx}`} alert={alert} />) : <div className="muted">{t('ideas_no_risk_alerts')}</div>}
          </Section>
        </>
      ) : null}
    </div>
  );
};

export default Ideas;
