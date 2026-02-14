import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api/apiClient';
import { subscribeBrowserPush } from './lib/notifications';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import Markets from './components/Markets';
import Alerts from './components/Alerts';
import Portfolio from './components/Portfolio';
import Settings from './components/Settings';
import Screener from './components/Screener';
import Groups from './components/Groups';
import LoadingScreen from './components/common/LoadingScreen';
import AssetDetail from './components/AssetDetail';
import AuthScreen from './components/AuthScreen';
import { useApp } from './store/AppContext';
import { useAuth } from './store/AuthContext';

const HealthBadge = ({ label, ok, detail }) => (
  <span className="badge" title={detail} style={{ background: ok ? '#00E08E22' : '#FF475722', color: ok ? '#00E08E' : '#FF4757' }}>
    {label}
  </span>
);

const MigrationModal = ({ stats, onAccept, onSkip, loading }) => (
  <div className="modal-backdrop" role="presentation">
    <section className="modal-card" role="dialog" aria-modal="true">
      <h3>Migrar datos locales</h3>
      <p className="muted" style={{ marginTop: 8 }}>
        Encontramos datos locales de Fase 1.
      </p>
      <div className="grid" style={{ marginTop: 8 }}>
        <div className="row">
          <span>Posiciones</span>
          <strong>{stats.positions}</strong>
        </div>
        <div className="row">
          <span>Watchlist</span>
          <strong>{stats.watchlist}</strong>
        </div>
        <div className="row">
          <span>Config</span>
          <strong>{stats.hasConfig ? 'Sí' : 'No'}</strong>
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" onClick={onSkip} disabled={loading}>
          Más tarde
        </button>
        <button type="button" onClick={onAccept} disabled={loading}>
          {loading ? 'Migrando...' : 'Migrar ahora'}
        </button>
      </div>
    </section>
  </div>
);

const toggleSector = (sectors, sector) => {
  if (sectors.includes(sector)) return sectors.filter((x) => x !== sector);
  return [...sectors, sector];
};

const OnboardingModal = ({ step, state, onChange, onPrev, onNext, onComplete, saving, pushLoading, pushMessage, pushError }) => (
  <div className="modal-backdrop" role="presentation">
    <section className="modal-card" role="dialog" aria-modal="true">
      <div className="row">
        <h3>Bienvenido a NexusFin</h3>
        <span className="badge" style={{ background: '#60A5FA22', color: '#60A5FA' }}>
          Paso {step}/4
        </span>
      </div>

      {step === 1 && (
        <div className="grid" style={{ marginTop: 10 }}>
          <p className="muted">¿Cuál es tu perfil de riesgo?</p>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="radio" checked={state.riskProfile === 'conservador'} onChange={() => onChange({ riskProfile: 'conservador' })} />
            <span>Conservador</span>
          </label>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="radio" checked={state.riskProfile === 'moderado'} onChange={() => onChange({ riskProfile: 'moderado' })} />
            <span>Moderado</span>
          </label>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="radio" checked={state.riskProfile === 'agresivo'} onChange={() => onChange({ riskProfile: 'agresivo' })} />
            <span>Agresivo</span>
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="grid" style={{ marginTop: 10 }}>
          <p className="muted">Seleccioná sectores de interés</p>
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
            {['tech', 'finance', 'health', 'energy', 'crypto', 'metals', 'bonds', 'fx'].map((sector) => (
              <button
                key={sector}
                type="button"
                onClick={() => onChange({ sectors: toggleSector(state.sectors, sector) })}
                style={{ borderColor: state.sectors.includes(sector) ? '#00E08E' : undefined }}
              >
                {sector}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid" style={{ marginTop: 10 }}>
          <p className="muted">¿Cuál es tu horizonte de inversión?</p>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="radio" checked={state.horizon === 'corto'} onChange={() => onChange({ horizon: 'corto' })} />
            <span>Corto plazo</span>
          </label>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="radio" checked={state.horizon === 'mediano'} onChange={() => onChange({ horizon: 'mediano' })} />
            <span>Mediano plazo</span>
          </label>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="radio" checked={state.horizon === 'largo'} onChange={() => onChange({ horizon: 'largo' })} />
            <span>Largo plazo</span>
          </label>
        </div>
      )}

      {step === 4 && (
        <div className="grid" style={{ marginTop: 10 }}>
          <p className="muted">Activá notificaciones para no perder oportunidades ni alertas de stop loss.</p>
          <button type="button" onClick={onComplete.enablePush} disabled={pushLoading}>
            {pushLoading ? 'Activando...' : 'Activar notificaciones push'}
          </button>
          {pushMessage && <div className="card" style={{ borderColor: '#00E08E88' }}>{pushMessage}</div>}
          {pushError && <div className="card" style={{ borderColor: '#FF4757AA' }}>{pushError}</div>}
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" onClick={onPrev} disabled={step === 1 || saving}>
          Anterior
        </button>
        {step < 4 ? (
          <button type="button" onClick={onNext} disabled={saving || (step === 2 && !state.sectors.length)}>
            Siguiente
          </button>
        ) : (
          <button type="button" onClick={onComplete.finish} disabled={saving}>
            {saving ? 'Finalizando...' : 'Finalizar onboarding'}
          </button>
        )}
      </div>
    </section>
  </div>
);

const App = () => {
  const { state, actions } = useApp();
  const { isAuthenticated, user, logout, loading: authLoading, completeOnboarding } = useAuth();
  const [migrationPrompt, setMigrationPrompt] = useState(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingPushLoading, setOnboardingPushLoading] = useState(false);
  const [onboardingPushMessage, setOnboardingPushMessage] = useState('');
  const [onboardingPushError, setOnboardingPushError] = useState('');
  const [onboardingDraft, setOnboardingDraft] = useState({
    riskProfile: 'moderado',
    sectors: ['tech', 'crypto', 'metals'],
    horizon: 'mediano'
  });

  const migrationPayload = useMemo(() => {
    try {
      const positions = JSON.parse(localStorage.getItem('nexusfin_portfolio') || '[]');
      const watchlist = JSON.parse(localStorage.getItem('nexusfin_watchlist') || '[]');
      const config = JSON.parse(localStorage.getItem('nexusfin_config') || 'null');

      const watchlistObjects = Array.isArray(watchlist)
        ? watchlist.map((symbol) => ({ symbol, name: symbol, type: 'stock', category: 'equity' }))
        : [];

      return {
        positions: Array.isArray(positions) ? positions : [],
        watchlist: watchlistObjects,
        config: config && typeof config === 'object' ? config : null
      };
    } catch {
      return { positions: [], watchlist: [], config: null };
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setMigrationPrompt(null);
      return;
    }

    const positions = migrationPayload.positions.length;
    const watchlist = migrationPayload.watchlist.length;
    const hasConfig = !!migrationPayload.config;

    if (positions || watchlist || hasConfig) {
      setMigrationPrompt({ positions, watchlist, hasConfig });
    }
  }, [isAuthenticated, migrationPayload]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setOnboardingOpen(false);
      return;
    }

    if (user.onboardingCompleted === false) {
      setOnboardingOpen(true);
      setOnboardingStep(1);
      setOnboardingDraft({
        riskProfile: state.config?.riskProfile || 'moderado',
        sectors: state.config?.sectors?.length ? state.config.sectors : ['tech', 'crypto', 'metals'],
        horizon: state.config?.horizon || 'mediano'
      });
    } else {
      setOnboardingOpen(false);
    }
  }, [isAuthenticated, user, state.config]);

  const runMigration = async () => {
    setMigrationLoading(true);
    try {
      await api.migrate(migrationPayload);
      localStorage.removeItem('nexusfin_portfolio');
      localStorage.removeItem('nexusfin_watchlist');
      localStorage.removeItem('nexusfin_config');
      setMigrationPrompt(null);
    } catch {
      setMigrationPrompt(null);
    } finally {
      setMigrationLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setBackendOffline(false);
      return undefined;
    }

    let active = true;
    const checkHealth = async () => {
      try {
        await api.health();
        if (active) setBackendOffline(false);
      } catch {
        if (active) setBackendOffline(true);
      }
    };

    checkHealth();
    const id = setInterval(checkHealth, 30000);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isAuthenticated]);

  const finishOnboarding = async () => {
    setOnboardingSaving(true);
    try {
      const nextConfig = {
        ...state.config,
        riskProfile: onboardingDraft.riskProfile,
        sectors: onboardingDraft.sectors,
        horizon: onboardingDraft.horizon
      };

      await actions.setConfig(nextConfig);
      if (typeof completeOnboarding === 'function') {
        await completeOnboarding();
      }
      setOnboardingOpen(false);
    } finally {
      setOnboardingSaving(false);
    }
  };

  const enablePushFromOnboarding = async () => {
    setOnboardingPushMessage('');
    setOnboardingPushError('');
    setOnboardingPushLoading(true);
    try {
      const out = await subscribeBrowserPush();
      if (out?.ok) {
        setOnboardingPushMessage('Notificaciones activadas.');
      } else {
        setOnboardingPushError('No se pudieron activar notificaciones en este dispositivo.');
      }
    } catch {
      setOnboardingPushError('No se pudieron activar notificaciones.');
    } finally {
      setOnboardingPushLoading(false);
    }
  };

  if (authLoading) {
    return <LoadingScreen loaded={0} total={1} />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  if (state.loading) {
    return <LoadingScreen loaded={state.progress.loaded} total={state.progress.total} />;
  }

  const finnhubOk = state.apiHealth.finnhub.errors === 0 || state.apiHealth.finnhub.calls > state.apiHealth.finnhub.errors;
  const alphaOk = state.apiHealth.alphavantage.errors === 0 || state.apiHealth.alphavantage.calls > state.apiHealth.alphavantage.errors;
  const claudeOk = state.apiHealth.claude.errors === 0;

  return (
    <div className="app">
      {migrationPrompt && !onboardingOpen && (
        <MigrationModal stats={migrationPrompt} onAccept={runMigration} onSkip={() => setMigrationPrompt(null)} loading={migrationLoading} />
      )}

      {onboardingOpen && (
        <OnboardingModal
          step={onboardingStep}
          state={onboardingDraft}
          onChange={(patch) => setOnboardingDraft((prev) => ({ ...prev, ...patch }))}
          onPrev={() => setOnboardingStep((prev) => Math.max(1, prev - 1))}
          onNext={() => setOnboardingStep((prev) => Math.min(4, prev + 1))}
          onComplete={{ finish: finishOnboarding, enablePush: enablePushFromOnboarding }}
          saving={onboardingSaving}
          pushLoading={onboardingPushLoading}
          pushMessage={onboardingPushMessage}
          pushError={onboardingPushError}
        />
      )}

      <header className="header">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1>NexusFin</h1>
            <p className="muted">Monitoreo financiero en tiempo real ({state.sourceMode})</p>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <span className="badge" style={{ background: '#60A5FA22', color: '#60A5FA' }}>
              WS: {state.wsStatus}
            </span>
            <span className="badge" style={{ background: '#8CC8FF22', color: '#8CC8FF' }}>
              {user?.email || 'usuario'}
            </span>
            <button type="button" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <HealthBadge label={`Finnhub ${state.apiHealth.finnhub.calls}/${state.apiHealth.finnhub.errors}`} ok={finnhubOk} detail={state.apiHealth.finnhub.lastError || 'OK'} />
          <HealthBadge label={`Alpha ${state.apiHealth.alphavantage.calls}/${state.apiHealth.alphavantage.errors}`} ok={alphaOk} detail={state.apiHealth.alphavantage.lastError || 'OK'} />
          <HealthBadge label={`Claude ${state.apiHealth.claude.calls}/${state.apiHealth.claude.errors}`} ok={claudeOk} detail={state.apiHealth.claude.lastError || 'OK'} />
        </div>

        {backendOffline && (
          <section className="card" style={{ marginTop: 8, borderColor: '#FBBF24AA' }}>
            <strong>Modo offline</strong>
            <div className="muted">No se pudo conectar con el backend. Verificá tu conexión o VITE_API_URL.</div>
          </section>
        )}

        {!!state.uiErrors.length && (
          <section className="card" style={{ marginTop: 8, borderColor: '#FF4757AA' }}>
            {state.uiErrors.map((e) => (
              <div key={e.id} className="row" style={{ marginBottom: 6 }}>
                <span>
                  <strong>{e.module}:</strong> {e.message}
                </span>
                <button type="button" onClick={() => actions.dismissUiError(e.id)}>
                  Ocultar
                </button>
              </div>
            ))}
          </section>
        )}
      </header>
      <Navigation />
      <main className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/markets/:symbol" element={<AssetDetail />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
