import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api/apiClient';
import { subscribeBrowserPush } from './lib/notifications';
import Navigation from './components/Navigation';
import Markets from './components/Markets';
import Alerts from './components/Alerts';
import Portfolio from './components/Portfolio';
import News from './components/News';
import Settings from './components/Settings';
import Screener from './components/Screener';
import Groups from './components/Groups';
import LoadingScreen from './components/common/LoadingScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import AssetDetail from './components/AssetDetail';
import AuthScreen from './components/AuthScreen';
import { useApp } from './store/AppContext';
import { useAuth } from './store/AuthContext';

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
          <span>Seguimiento</span>
          <strong>{stats.watchlist}</strong>
        </div>
        <div className="row">
          <span>Ajustes</span>
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

const RouteBoundary = ({ moduleName, children }) => <ErrorBoundary moduleName={moduleName}>{children}</ErrorBoundary>;

const OnboardingModal = ({ step, state, onChange, onPrev, onNext, onComplete, saving, pushLoading, pushMessage, pushError }) => (
  <div className="modal-backdrop" role="presentation">
    <section className="modal-card" role="dialog" aria-modal="true">
      <div className="row">
        <h3>Bienvenido a Horsai</h3>
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
  const [backendLastOkAt, setBackendLastOkAt] = useState(null);
  const [backendFailures, setBackendFailures] = useState(0);
  const [networkOffline, setNetworkOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingPushLoading, setOnboardingPushLoading] = useState(false);
  const [onboardingPushMessage, setOnboardingPushMessage] = useState('');
  const [onboardingPushError, setOnboardingPushError] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
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
      setBackendFailures(0);
      setBackendLastOkAt(null);
      return undefined;
    }

    let active = true;
    const checkHealth = async () => {
      try {
        await api.health();
        if (active) {
          setBackendOffline(false);
          setBackendFailures(0);
          setBackendLastOkAt(Date.now());
        }
      } catch {
        if (active) {
          setBackendFailures((prev) => prev + 1);
        }
      }
    };

    checkHealth();
    const id = setInterval(checkHealth, 30000);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const threshold = backendLastOkAt ? 2 : 1;
    if (backendFailures >= threshold) {
      setBackendOffline(true);
    }
  }, [backendFailures, backendLastOkAt, isAuthenticated]);

  useEffect(() => {
    const onOnline = () => setNetworkOffline(false);
    const onOffline = () => setNetworkOffline(true);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!userMenuRef.current) return;
      if (userMenuRef.current.contains(event.target)) return;
      setUserMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

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

  const lastUpdatedLabel = state.lastUpdated
    ? new Date(state.lastUpdated).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' })
    : 'sin datos';
  const backendLastOkLabel = backendLastOkAt
    ? new Date(backendLastOkAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    : null;

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
        <div className="top-header card">
          <div>
            <h1 className="brand-title">Horsai</h1>
          </div>
          <div className="header-actions">
            <button type="button" className="icon-btn" aria-label="Notificaciones">
              <svg viewBox="0 0 24 24">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
            <button type="button" className="icon-btn" aria-label="Buscar">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.8-3.8" />
              </svg>
            </button>
            <div className="user-menu-wrap" ref={userMenuRef}>
              <button
                type="button"
                className="user-avatar"
                aria-label="Menú de usuario"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((prev) => !prev)}
              >
                {String(user?.email || 'U').slice(0, 1).toUpperCase()}
              </button>
              {userMenuOpen ? (
                <div className="user-menu card">
                  <div className="user-menu-email mono">{user?.email || 'usuario'}</div>
                  <button
                    type="button"
                    className="logout-btn"
                    aria-label="Cerrar sesión"
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                  >
                    Cerrar sesión
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <span className="badge" style={{ background: '#8CC8FF22', color: '#8CC8FF' }}>
            Actualizado: {lastUpdatedLabel}
          </span>
        </div>

        {(backendOffline || networkOffline) && (
          <section className="card" style={{ marginTop: 8, borderColor: '#FBBF24AA' }} role="status" aria-live="polite">
            <strong>{networkOffline ? 'Sin conexión' : 'Modo offline'}</strong>
            <div className="muted">
              {networkOffline
                ? 'Tu dispositivo está sin red. Mostramos datos guardados cuando están disponibles.'
                : 'No se pudo conectar con el backend. Verificá tu conexión o VITE_API_URL.'}
            </div>
            {!networkOffline && backendLastOkLabel ? (
              <div className="muted" style={{ marginTop: 6 }}>
                Última sincronización backend: {backendLastOkLabel}
              </div>
            ) : null}
            {!networkOffline && backendFailures > 0 ? (
              <div className="muted">Reintentos fallidos: {backendFailures}</div>
            ) : null}
          </section>
        )}

      </header>
      <Navigation />
      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/alerts" replace />} />
          <Route
            path="/markets"
            element={
              <RouteBoundary moduleName="Mercados">
                <Markets />
              </RouteBoundary>
            }
          />
          <Route
            path="/markets/:symbol"
            element={
              <RouteBoundary moduleName="Detalle de activo">
                <AssetDetail />
              </RouteBoundary>
            }
          />
          <Route
            path="/alerts"
            element={
              <RouteBoundary moduleName="Agente IA">
                <Alerts />
              </RouteBoundary>
            }
          />
          <Route
            path="/portfolio"
            element={
              <RouteBoundary moduleName="Cartera">
                <Portfolio />
              </RouteBoundary>
            }
          />
          <Route
            path="/news"
            element={
              <RouteBoundary moduleName="Noticias">
                <News />
              </RouteBoundary>
            }
          />
          <Route
            path="/screener"
            element={
              <RouteBoundary moduleName="Screener">
                <Screener />
              </RouteBoundary>
            }
          />
          <Route
            path="/groups"
            element={
              <RouteBoundary moduleName="Grupos">
                <Groups />
              </RouteBoundary>
            }
          />
          <Route
            path="/settings"
            element={
              <RouteBoundary moduleName="Configuración">
                <Settings />
              </RouteBoundary>
            }
          />
          <Route path="*" element={<Navigate to="/alerts" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
