import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import RegimeBadge from './RegimeBadge';
import CrisisBanner from './CrisisBanner';

const friendlyDate = (isoDate) => {
  const date = isoDate ? new Date(`${isoDate}T12:00:00`) : new Date();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const NewsDigest = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [digest, setDigest] = useState(null);
  const [crisis, setCrisis] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [digestOut, crisisOut] = await Promise.all([api.getDigestToday(), api.getCrisisToday()]);
      setDigest(digestOut || null);
      setCrisis(crisisOut || null);
    } catch {
      setError('Could not load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const bullets = useMemo(() => (Array.isArray(digest?.bullets) ? digest.bullets.slice(0, 10) : []), [digest]);
  const keyRisks = useMemo(() => (Array.isArray(digest?.key_risks) ? digest.key_risks.slice(0, 4) : []), [digest]);
  const leadership = useMemo(() => (Array.isArray(digest?.leadership) ? digest.leadership.slice(0, 6) : []), [digest]);
  const macroDrivers = useMemo(() => (Array.isArray(digest?.macro_drivers) ? digest.macro_drivers.slice(0, 6) : []), [digest]);
  const pending = Boolean(digest?.pending);

  return (
    <div className="grid">
      <RegimeBadge
        regimeLabel={digest?.regime_label || 'Mixed'}
        volatilityLabel={digest?.volatility_label || 'Calm'}
        confidence={digest?.confidence}
        confidenceLabel={digest?.confidence_label}
      />

      <CrisisBanner crisis={crisis || { is_active: digest?.crisis_active }} />

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

      {!loading && !error && pending ? (
        <section className="news-pending-state">📰 Today's briefing will be available after market close (6:15 PM ET)</section>
      ) : null}

      {!loading && !error && !pending ? (
        <>
          <section className="card">
            <h2 className="screen-title">Today's Briefing · {friendlyDate(digest?.date)}</h2>
            <ul className="digest-bullet-list">
              {bullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          {keyRisks.length ? (
            <section className="card key-risks-card">
              <h3 className="section-title">Key Risks</h3>
              <ul className="digest-bullet-list risk-bullet-list">
                {keyRisks.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card">
            <div className="mini-section-title">Leadership</div>
            <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {leadership.length ? leadership.map((item) => <span className="pill-muted" key={item}>{item}</span>) : <span className="muted">No leadership data.</span>}
            </div>
            <div className="mini-section-title" style={{ marginTop: 10 }}>Macro Drivers</div>
            <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {macroDrivers.length ? macroDrivers.map((item) => <span className="pill-muted" key={item}>{item}</span>) : <span className="muted">No macro drivers.</span>}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
};

export default NewsDigest;
