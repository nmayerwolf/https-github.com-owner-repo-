import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navigation from './components/Navigation';
import AuthScreen from './components/AuthScreen';
import { api } from './api/apiClient';
import { useAuth } from './store/AuthContext';
import { useLanguage } from './store/LanguageContext';

const AppShell = ({ children, onLogout, title }) => (
  <div className="app">
    <header className="header">
      <div className="top-header">
        <div className="brand-lockup">
          <h1 className="brand-title">Horsai</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={onLogout}>{title.logout}</button>
        </div>
      </div>
    </header>
    {children}
    <Navigation />
  </div>
);

const BriefPage = ({ isSpanish }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.getBriefToday();
      setData(out);
    } catch (err) {
      setError(String(err?.message || err?.error || 'Error loading brief'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="grid">
      <section className="card">
        <div className="row">
          <h2>{isSpanish ? 'Brief Diario' : 'Daily Brief'}</h2>
          <button type="button" onClick={load} disabled={loading}>{isSpanish ? 'Actualizar' : 'Refresh'}</button>
        </div>
        {loading ? <p className="muted">{isSpanish ? 'Cargando...' : 'Loading...'}</p> : null}
        {error ? <p className="muted">{error}</p> : null}
        {data ? (
          <>
            <p>{data.mainParagraph || data.note}</p>
            <div className="grid">
              {(Array.isArray(data.bullets) ? data.bullets : []).slice(0, 5).map((item, idx) => (
                <div key={`bullet-${idx}`} className="card">• {item}</div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
};

const IdeasPage = ({ isSpanish }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pkg, setPkg] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [todayPkg, feed] = await Promise.all([api.getPackagesToday(), api.getIdeas()]);
      setPkg(todayPkg || null);
      setIdeas(Array.isArray(feed?.ideas) ? feed.ideas : []);
    } catch (err) {
      setError(String(err?.message || err?.error || 'Error loading ideas'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onAnalyze = async (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    setSending(true);
    setError('');
    try {
      const out = await api.analyzeIdeaPrompt(prompt.trim());
      setAnalysis(out);
      setPrompt('');
      await load();
    } catch (err) {
      setError(String(err?.message || err?.error || 'Error analyzing prompt'));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="grid">
      <section className="card">
        <div className="row">
          <h2>{isSpanish ? 'Ideas' : 'Ideas'}</h2>
          <button type="button" onClick={load} disabled={loading}>{isSpanish ? 'Actualizar' : 'Refresh'}</button>
        </div>
        {loading ? <p className="muted">{isSpanish ? 'Cargando...' : 'Loading...'}</p> : null}
        {error ? <p className="muted">{error}</p> : null}

        {pkg?.regime ? (
          <div className="card">
            <strong>{isSpanish ? 'Régimen' : 'Regime'}: {pkg.regime.state}</strong>
            <p className="muted">{pkg.regime.narrative}</p>
          </div>
        ) : null}

        <div className="grid">
          {(Array.isArray(pkg?.themes) ? pkg.themes : []).map((theme) => (
            <div key={theme?.themeScore?.themeId || Math.random()} className="card">
              <strong>{theme?.themeScore?.themeId} · {theme?.themeScore?.score}</strong>
              <p className="muted">{theme?.themeScore?.narrative}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>{isSpanish ? 'Ask Horsai' : 'Ask Horsai'}</h3>
        <form className="grid" onSubmit={onAnalyze}>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={isSpanish ? 'Ej: Analizá NVDA para 3 meses' : 'Ex: Analyze NVDA for 3 months'} />
          <button type="submit" disabled={sending}>{sending ? (isSpanish ? 'Analizando...' : 'Analyzing...') : (isSpanish ? 'Analizar' : 'Analyze')}</button>
        </form>
        {analysis ? <div className="card"><strong>{analysis.message}</strong></div> : null}
      </section>

      <section className="card">
        <h3>{isSpanish ? 'Feed de ideas' : 'Ideas feed'}</h3>
        <div className="grid">
          {ideas.map((idea) => (
            <div key={idea.id} className="card">
              <strong>{idea.title}</strong>
              <p className="muted">{idea.summary}</p>
              <div className="row"><span>{idea.status}</span><strong>{Number(idea.conviction_score || 0).toFixed(0)}</strong></div>
            </div>
          ))}
          {!ideas.length ? <p className="muted">{isSpanish ? 'Sin ideas aún.' : 'No ideas yet.'}</p> : null}
        </div>
      </section>
    </main>
  );
};

const PortfolioPage = ({ isSpanish }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [challenges, setChallenges] = useState([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [portfolio, challengeOut] = await Promise.all([api.getPortfolio(), api.getPortfolioChallenges()]);
      setSnapshot(portfolio || null);
      setChallenges(Array.isArray(challengeOut?.challenges) ? challengeOut.challenges : []);
    } catch (err) {
      setError(String(err?.message || err?.error || 'Error loading portfolio'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="grid">
      <section className="card">
        <div className="row">
          <h2>{isSpanish ? 'Portfolio' : 'Portfolio'}</h2>
          <button type="button" onClick={load} disabled={loading}>{isSpanish ? 'Actualizar' : 'Refresh'}</button>
        </div>
        {loading ? <p className="muted">{isSpanish ? 'Cargando...' : 'Loading...'}</p> : null}
        {error ? <p className="muted">{error}</p> : null}
        {snapshot?.empty ? <p>{snapshot.cta}</p> : null}
        {!snapshot?.empty ? (
          <div className="grid">
            {(Array.isArray(snapshot?.positions) ? snapshot.positions : []).map((position, idx) => (
              <div key={`${position.ticker}-${idx}`} className="card">
                <div className="row"><strong>{position.ticker}</strong><span>{(Number(position.weight || 0) * 100).toFixed(1)}%</span></div>
                <p className="muted">MV: {Number(position.marketValue || 0).toFixed(2)}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h3>{isSpanish ? 'Challenges' : 'Challenges'}</h3>
        <div className="grid">
          {challenges.map((challenge) => (
            <div key={challenge.challengeId} className="card">
              <div className="row"><strong>{challenge.type}</strong><span>{challenge.severity}</span></div>
              <p className="muted">{challenge.narrative}</p>
            </div>
          ))}
          {!challenges.length ? <p className="muted">{isSpanish ? 'Sin challenges activos.' : 'No active challenges.'}</p> : null}
        </div>
      </section>
    </main>
  );
};

const App = () => {
  const { isSpanish } = useLanguage();
  const { isAuthenticated, loading, logout } = useAuth();

  const title = useMemo(
    () => ({ logout: isSpanish ? 'Salir' : 'Logout' }),
    [isSpanish]
  );

  if (loading) {
    return <div className="app"><div className="card">{isSpanish ? 'Inicializando sesión...' : 'Initializing session...'}</div></div>;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <AppShell onLogout={() => logout('')} title={title}>
      <Routes>
        <Route path="/" element={<Navigate to="/brief" replace />} />
        <Route path="/brief" element={<BriefPage isSpanish={isSpanish} />} />
        <Route path="/ideas" element={<IdeasPage isSpanish={isSpanish} />} />
        <Route path="/portfolio" element={<PortfolioPage isSpanish={isSpanish} />} />
        <Route path="*" element={<Navigate to="/brief" replace />} />
      </Routes>
    </AppShell>
  );
};

export default App;
