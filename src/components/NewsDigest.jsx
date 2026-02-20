import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import RegimeBadge from './RegimeBadge';
import CrisisBanner from './CrisisBanner';
import { useTranslation } from '../i18n/useTranslation';

const friendlyDate = (isoDate, locale = 'en-US') => {
  const date = isoDate ? new Date(`${isoDate}T12:00:00`) : new Date();
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
};

const NewsDigest = () => {
  const { t, language } = useTranslation();
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
  const locale = language === 'en' ? 'en-US' : 'es-AR';

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

      {!loading && !error && pending ? (
        <section className="news-pending-state">📰 {t('news_pending')}</section>
      ) : null}

      {!loading && !error && !pending ? (
        <>
          <section className="card">
            <h2 className="screen-title">{t('news_briefing')} · {friendlyDate(digest?.date, locale)}</h2>
            <ul className="digest-bullet-list">
              {bullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          {keyRisks.length ? (
            <section className="card key-risks-card">
              <h3 className="section-title">{t('news_key_risks')}</h3>
              <ul className="digest-bullet-list risk-bullet-list">
                {keyRisks.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card">
            <div className="mini-section-title">{t('news_leadership')}</div>
            <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {leadership.length ? leadership.map((item) => <span className="pill-muted" key={item}>{item}</span>) : <span className="muted">{t('news_no_leadership')}</span>}
            </div>
            <div className="mini-section-title" style={{ marginTop: 10 }}>{t('news_macro_drivers')}</div>
            <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {macroDrivers.length ? macroDrivers.map((item) => <span className="pill-muted" key={item}>{item}</span>) : <span className="muted">{t('news_no_macro')}</span>}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
};

export default NewsDigest;
