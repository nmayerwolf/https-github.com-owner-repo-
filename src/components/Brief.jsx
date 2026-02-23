import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useLanguage } from '../store/LanguageContext';

const artDateTime = (value, isSpanish) => {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(isSpanish ? 'es-AR' : 'en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short'
  });
};

const Brief = () => {
  const { isSpanish } = useLanguage();
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askResponse, setAskResponse] = useState(null);

  const t = useMemo(
    () =>
      isSpanish
        ? {
            title: 'Brief diario',
            loading: 'Generando brief...',
            askLabel: 'Preguntar sobre hoy (explicativo, sin recomendaciones)',
            askButton: 'Preguntar',
            generated: 'Generado',
            bullets: 'Claves del día',
            assets: 'Activos destacados',
            noAssets: 'No hay activos destacados por ahora.',
            askError: 'No pudimos responder ahora.',
            emptyPrompt: 'Escribí una pregunta primero.'
          }
        : {
            title: 'Daily Brief',
            loading: 'Generating brief...',
            askLabel: 'Ask about today (explanatory, no recommendations)',
            askButton: 'Ask',
            generated: 'Generated',
            bullets: 'Today highlights',
            assets: 'Highlighted assets',
            noAssets: 'No highlighted assets yet.',
            askError: 'We could not answer right now.',
            emptyPrompt: 'Write a question first.'
          },
    [isSpanish]
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const out = await api.getBriefToday();
        if (!active) return;
        setBrief(out || null);
      } catch {
        if (!active) return;
        setError(isSpanish ? 'No se pudo cargar el brief de hoy.' : 'Could not load today brief.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [isSpanish]);

  const submitAsk = async () => {
    const safePrompt = String(prompt || '').trim();
    if (!safePrompt) {
      setAskResponse({ error: t.emptyPrompt });
      return;
    }
    setAskLoading(true);
    setAskResponse(null);
    try {
      const out = await api.askBriefToday(safePrompt);
      setAskResponse(out || null);
    } catch {
      setAskResponse({ error: t.askError });
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <div className="grid ideas-page">
      <section className="card ideas-header-card">
        <h2 className="screen-title">{t.title}</h2>
        {brief?.generated_at ? <div className="muted">{t.generated}: {artDateTime(brief.generated_at, isSpanish)} ART</div> : null}
      </section>

      {loading ? <section className="card muted">{t.loading}</section> : null}
      {error ? <section className="card" style={{ borderColor: '#FF4757AA' }}>{error}</section> : null}

      {brief ? (
        <>
          <section className="card">
            <p style={{ margin: 0 }}>{brief.main_paragraph}</p>
          </section>

          <section className="card">
            <h3 className="section-title">{t.bullets}</h3>
            <ul className="ideas-list" style={{ marginTop: 8 }}>
              {(Array.isArray(brief.bullets) ? brief.bullets : []).slice(0, 5).map((item, idx) => (
                <li key={`bullet-${idx}`}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h3 className="section-title">{t.assets}</h3>
            <div className="grid" style={{ marginTop: 8 }}>
              {!Array.isArray(brief.highlighted_assets) || !brief.highlighted_assets.length ? <div className="muted">{t.noAssets}</div> : null}
              {(Array.isArray(brief.highlighted_assets) ? brief.highlighted_assets : []).slice(0, 10).map((asset, idx) => (
                <article key={`asset-${idx}`} className="ideas-card strategic">
                  <div className="row">
                    <strong>{asset.symbol || asset.name || 'Asset'}</strong>
                    {asset.name ? <span className="muted">{asset.name}</span> : null}
                  </div>
                  <div style={{ marginTop: 6 }}>{asset.what_happened}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{asset.why_it_matters}</div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section className="card">
        <h3 className="section-title">{t.askLabel}</h3>
        <textarea
          className="input"
          style={{ minHeight: 96, marginTop: 8 }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={isSpanish ? 'Ej: ¿Qué cambió hoy en tasas y por qué importa?' : 'Ex: What changed today in rates and why it matters?'}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" onClick={submitAsk} disabled={askLoading}>
            {askLoading ? '...' : t.askButton}
          </button>
        </div>
        {askResponse?.error ? <div className="card" style={{ marginTop: 8, borderColor: '#FF4757AA' }}>{askResponse.error}</div> : null}
        {askResponse?.answer ? (
          <div className="card" style={{ marginTop: 8 }}>
            <p style={{ marginTop: 0 }}>{askResponse.answer}</p>
            <ul className="ideas-list">
              {(Array.isArray(askResponse.context_bullets) ? askResponse.context_bullets : []).map((item, idx) => (
                <li key={`ctx-${idx}`}>{item}</li>
              ))}
            </ul>
            {askResponse.note ? <div className="muted">{askResponse.note}</div> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default Brief;
