import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { IDEAS_ADMIN_CONTROLS } from '../config/features';
import { useLanguage } from '../store/LanguageContext';
import { useAuth } from '../store/AuthContext';

const statusOrder = ['ACTIVE', 'UNDER_REVIEW', 'CLOSED'];

const artDateTime = (value, isSpanish) => {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString(isSpanish ? 'es-AR' : 'en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short'
  });
};

const latestChange = (idea) => {
  const rows = Array.isArray(idea?.change_log) ? idea.change_log : [];
  return rows.length ? rows[rows.length - 1] : null;
};

const Markets = () => {
  const { isSpanish } = useLanguage();
  const { user } = useAuth();
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [askPrompt, setAskPrompt] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const canAdmin = IDEAS_ADMIN_CONTROLS && String(user?.role || '').toLowerCase() === 'superadmin';

  const t = useMemo(
    () =>
      isSpanish
        ? {
            title: 'Ideas',
            subtitle: 'Feed cronológico por última actualización visible',
            empty: 'Todavía no hay ideas para mostrar.',
            askTitle: 'Ask Horsai',
            askButton: 'Analizar',
            qualifies: 'Califica como Idea Activa',
            lastReviewed: 'Última revisión',
            whatChanged: 'Qué cambió',
            highConviction: 'High Conviction',
            close: 'Cerrar',
            reviewNow: 'Re-review now'
          }
        : {
            title: 'Ideas',
            subtitle: 'Chronological feed by last visible update',
            empty: 'No ideas to show yet.',
            askTitle: 'Ask Horsai',
            askButton: 'Analyze',
            qualifies: 'Qualifies as Active Idea',
            lastReviewed: 'Last reviewed',
            whatChanged: 'What changed',
            highConviction: 'High Conviction',
            close: 'Close',
            reviewNow: 'Re-review now'
          },
    [isSpanish]
  );

  const loadIdeas = async (filter = statusFilter) => {
    setLoading(true);
    setError('');
    try {
      const out = await api.getIdeas(filter === 'ALL' ? null : filter);
      const rows = Array.isArray(out?.ideas) ? out.ideas : [];
      setIdeas(rows);
    } catch {
      setError(isSpanish ? 'No se pudieron cargar las ideas.' : 'Could not load ideas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIdeas('ALL');
  }, []);

  const onAnalyze = async () => {
    const prompt = String(askPrompt || '').trim();
    if (!prompt) return;
    setAskLoading(true);
    setAnalysis(null);
    try {
      const out = await api.analyzeIdeaPrompt(prompt);
      setAnalysis(out || null);
      setAskPrompt('');
      await loadIdeas(statusFilter);
    } catch {
      setAnalysis({ error: isSpanish ? 'No pudimos analizar ese prompt.' : 'We could not analyze that prompt.' });
    } finally {
      setAskLoading(false);
    }
  };

  const onReviewNow = async (id) => {
    await api.reviewIdeaNow(id);
    await loadIdeas(statusFilter);
  };

  const onClose = async (id) => {
    const reason = window.prompt(isSpanish ? 'Motivo de cierre' : 'Closure reason');
    await api.closeIdea(id, reason || '');
    await loadIdeas(statusFilter);
  };

  return (
    <div className="grid ideas-page">
      <section className="card ideas-header-card">
        <h2 className="screen-title">{t.title}</h2>
        <div className="muted">{t.subtitle}</div>
        <div className="row" style={{ justifyContent: 'flex-start', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {['ALL', ...statusOrder].map((status) => (
            <button key={status} type="button" className="inline-link-btn" onClick={() => {
              setStatusFilter(status);
              loadIdeas(status);
            }}>
              {status}
            </button>
          ))}
        </div>
      </section>

      {loading ? <section className="card muted">Loading...</section> : null}
      {error ? <section className="card" style={{ borderColor: '#FF4757AA' }}>{error}</section> : null}
      {!loading && !error && !ideas.length ? <section className="card muted">{t.empty}</section> : null}

      {ideas.map((idea) => {
        const change = latestChange(idea);
        const status = String(idea.status || 'UNDER_REVIEW').toUpperCase();
        return (
          <section key={idea.id} className="card ideas-card strategic">
            <div className="row">
              <strong>{idea.title}</strong>
              <div className="row" style={{ gap: 6 }}>
                <span className="badge">{status}</span>
                <span className="brief-tone-pill neutral">{idea.horizon}</span>
                {idea.high_conviction ? <span className="brief-tone-pill positive">{t.highConviction}</span> : null}
              </div>
            </div>

            <div style={{ marginTop: 8 }}><strong>Thesis:</strong> {idea.thesis}</div>
            <div style={{ marginTop: 8 }}><strong>Fundamentals:</strong> {idea.fundamentals}</div>
            <div style={{ marginTop: 8 }}><strong>Catalyst:</strong> {idea.catalyst}</div>
            <div style={{ marginTop: 8 }}><strong>Dislocation:</strong> {idea.dislocation}</div>
            <div style={{ marginTop: 8 }}><strong>Risks:</strong> {idea.risks}</div>

            <div className="row" style={{ marginTop: 10, justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
              <span className="brief-tone-pill neutral">Conviction: {Number(idea.conviction_total || 0).toFixed(1)}</span>
              <span className="brief-tone-pill neutral">F: {Number(idea.conviction_breakdown?.fundamentals || 0).toFixed(1)}</span>
              <span className="brief-tone-pill neutral">C: {Number(idea.conviction_breakdown?.catalyst || 0).toFixed(1)}</span>
              <span className="brief-tone-pill neutral">D: {Number(idea.conviction_breakdown?.dislocation || 0).toFixed(1)}</span>
              <span className="brief-tone-pill neutral">A: {Number(idea.conviction_breakdown?.asymmetry || 0).toFixed(1)}</span>
            </div>

            <div className="muted" style={{ marginTop: 8 }}>{t.lastReviewed}: {artDateTime(idea.last_reviewed_at, isSpanish)} ART</div>
            {change?.explanation ? (
              <div className="ideas-invalidation" style={{ marginTop: 8 }}>
                <strong>{t.whatChanged}:</strong> {change.explanation}
              </div>
            ) : null}

            {canAdmin ? (
              <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8 }}>
                <button type="button" className="inline-link-btn" onClick={() => onReviewNow(idea.id)}>{t.reviewNow}</button>
                {status !== 'CLOSED' ? <button type="button" className="inline-link-btn" onClick={() => onClose(idea.id)}>{t.close}</button> : null}
              </div>
            ) : null}
          </section>
        );
      })}

      <section className="card">
        <h3 className="section-title">{t.askTitle}</h3>
        <textarea
          className="input"
          style={{ minHeight: 96, marginTop: 8 }}
          value={askPrompt}
          onChange={(e) => setAskPrompt(e.target.value)}
          placeholder={isSpanish ? 'Analizar activo, sector, mercado o tema...' : 'Analyze an asset, sector, market or theme...'}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" onClick={onAnalyze} disabled={askLoading}>{askLoading ? '...' : t.askButton}</button>
        </div>

        {analysis?.error ? <div className="card" style={{ marginTop: 8, borderColor: '#FF4757AA' }}>{analysis.error}</div> : null}
        {analysis?.response ? (
          <article className="card" style={{ marginTop: 8 }}>
            <div><strong>Thesis:</strong> {analysis.response.thesis}</div>
            <div><strong>Fundamentals:</strong> {analysis.response.fundamentals}</div>
            <div><strong>What changed now:</strong> {analysis.response.what_changed_now}</div>
            <div><strong>Dislocation:</strong> {analysis.response.dislocation}</div>
            <div><strong>Risks:</strong> {analysis.response.risks}</div>
            <div style={{ marginTop: 8 }}>
              <strong>Conviction:</strong> {Number(analysis.response.conviction_total || 0).toFixed(1)}
              {' · '}
              F {Number(analysis.response.conviction_breakdown?.fundamentals || 0).toFixed(1)}
              {' · '}
              C {Number(analysis.response.conviction_breakdown?.catalyst || 0).toFixed(1)}
              {' · '}
              D {Number(analysis.response.conviction_breakdown?.dislocation || 0).toFixed(1)}
              {' · '}
              A {Number(analysis.response.conviction_breakdown?.asymmetry || 0).toFixed(1)}
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              {t.qualifies}: <strong>{analysis.response.qualifies_as_active_idea}</strong>
            </div>
          </article>
        ) : null}
      </section>
    </div>
  );
};

export default Markets;
