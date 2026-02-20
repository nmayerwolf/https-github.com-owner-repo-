import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api/apiClient';
import { subscribeBrowserPush } from './lib/notifications';
import Navigation from './components/Navigation';
import Markets from './components/Markets';
import Ideas from './components/Ideas';
import Portfolio from './components/Portfolio';
import News from './components/News';
import Settings from './components/Settings';
import Screener from './components/Screener';
import Groups from './components/Groups';
import LoadingScreen from './components/common/LoadingScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import AssetDetail from './components/AssetDetail';
import AuthScreen from './components/AuthScreen';
import HorsaiHorseIcon from './components/common/HorsaiHorseIcon';
import { useApp } from './store/AppContext';
import { useAuth } from './store/AuthContext';
import { MARKET_VISIBLE } from './config/features';
import { LanguageContext } from './i18n/LanguageContext';

const MIGRATION_DISMISSED_KEY = 'horsai_migration_prompt_dismissed_v1';
const LEGACY_KEYS = {
  positions: 'nexusfin_phase1_portfolio',
  watchlist: 'nexusfin_phase1_watchlist',
  config: 'nexusfin_phase1_config'
};

const loadLegacyMigrationPayload = () => {
  try {
    const positions = JSON.parse(localStorage.getItem(LEGACY_KEYS.positions) || '[]');
    const watchlist = JSON.parse(localStorage.getItem(LEGACY_KEYS.watchlist) || '[]');
    const config = JSON.parse(localStorage.getItem(LEGACY_KEYS.config) || 'null');

    const watchlistObjects = Array.isArray(watchlist)
      ? watchlist
          .map((symbol) => String(symbol || '').toUpperCase())
          .filter(Boolean)
          .map((symbol) => ({ symbol, name: symbol, type: 'stock', category: 'equity' }))
      : [];

    return {
      positions: Array.isArray(positions) ? positions : [],
      watchlist: watchlistObjects,
      config: config && typeof config === 'object' ? config : null
    };
  } catch {
    return { positions: [], watchlist: [], config: null };
  }
};

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

const RouteBoundary = ({ moduleName, children }) => <ErrorBoundary moduleName={moduleName}>{children}</ErrorBoundary>;

const OnboardingModal = ({ onComplete, saving, pushLoading, pushMessage, pushError }) => (
  <div className="modal-backdrop" role="presentation">
    <section className="modal-card" role="dialog" aria-modal="true">
      <div className="row">
        <h3>Bienvenido a Horsai</h3>
        <span className="badge" style={{ background: '#60A5FA22', color: '#60A5FA' }}>Inicio rápido</span>
      </div>

      <div className="grid" style={{ marginTop: 10 }}>
        <p className="muted">Podés activar notificaciones ahora (opcional). El perfil inversor se configura automáticamente.</p>
        <button type="button" onClick={onComplete.enablePush} disabled={pushLoading}>
          {pushLoading ? 'Activando...' : 'Activar notificaciones push'}
        </button>
        {pushMessage && <div className="card" style={{ borderColor: '#00E08E88' }}>{pushMessage}</div>}
        {pushError && <div className="card" style={{ borderColor: '#FF4757AA' }}>{pushError}</div>}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" onClick={onComplete.finish} disabled={saving}>
          {saving ? 'Finalizando...' : 'Finalizar onboarding'}
        </button>
      </div>
    </section>
  </div>
);

const AdminDashboardModal = ({ open, loading, error, data, onClose, onRefresh }) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Admin Dashboard</h3>
          <button type="button" className="icon-btn" aria-label="Cerrar panel admin" onClick={onClose}>
            ✕
          </button>
        </div>
        {loading ? <p className="muted" style={{ marginTop: 8 }}>Cargando métricas...</p> : null}
        {error ? <div className="card" style={{ marginTop: 8, borderColor: '#FF4757AA' }}>{error}</div> : null}
        {!loading && !error && data ? (
          <>
            <div className="grid" style={{ marginTop: 8, gap: 8 }}>
              <div className="row"><span>Users</span><strong>{data.total_users}</strong></div>
              <div className="row"><span>Active today</span><strong>{data.active_today}</strong></div>
              <div className="row"><span>Cost today</span><strong>${Number(data.cost_today_usd || 0).toFixed(4)}</strong></div>
              <div className="row"><span>Month</span><strong>${Number(data.cost_this_month_usd || 0).toFixed(4)}</strong></div>
            </div>
            <div style={{ marginTop: 10 }}>
              <strong>Top users today</strong>
              <div className="grid" style={{ marginTop: 6, gap: 6 }}>
                {Array.isArray(data.top_users_today) && data.top_users_today.length ? (
                  data.top_users_today.map((row) => (
                    <div key={row.email} className="row">
                      <span className="mono" style={{ fontSize: 12 }}>{row.email}</span>
                      <strong>${Number(row.cost_usd || 0).toFixed(4)} · {Number(row.calls || 0)} calls</strong>
                    </div>
                  ))
                ) : (
                  <div className="muted">Sin actividad registrada hoy.</div>
                )}
              </div>
            </div>
          </>
        ) : null}
        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          <button type="button" className="inline-link-btn" onClick={onRefresh} disabled={loading}>
            Actualizar
          </button>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  );
};

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useApp();
  const { isAuthenticated, user, logout, loading: authLoading, completeOnboarding } = useAuth();
  const { setLanguage } = useContext(LanguageContext);
  const [migrationPrompt, setMigrationPrompt] = useState(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [backendLastOkAt, setBackendLastOkAt] = useState(null);
  const [backendFailures, setBackendFailures] = useState(0);
  const [networkOffline, setNetworkOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingPushLoading, setOnboardingPushLoading] = useState(false);
  const [onboardingPushMessage, setOnboardingPushMessage] = useState('');
  const [onboardingPushError, setOnboardingPushError] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminDashboard, setAdminDashboard] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState([]);
  const notifMenuRef = useRef(null);
  const processedRealtimeRef = useRef(new Set());
  const seenInviteRef = useRef(new Set());
  const migrationPayload = useMemo(() => loadLegacyMigrationPayload(), [isAuthenticated]);

  const markMigrationPromptDismissed = () => {
    try {
      localStorage.setItem(MIGRATION_DISMISSED_KEY, '1');
    } catch {
      // noop
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setMigrationPrompt(null);
      return;
    }
    try {
      if (localStorage.getItem(MIGRATION_DISMISSED_KEY) === '1') {
        setMigrationPrompt(null);
        return;
      }
    } catch {
      // noop
    }

    const positions = migrationPayload.positions.length;
    const watchlist = migrationPayload.watchlist.length;
    const hasConfig = !!migrationPayload.config;

    if (positions || watchlist || hasConfig) {
      setMigrationPrompt({ positions, watchlist, hasConfig });
    } else {
      markMigrationPromptDismissed();
      setMigrationPrompt(null);
    }
  }, [isAuthenticated, migrationPayload]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setOnboardingOpen(false);
      return;
    }

    if (user.onboardingCompleted === false) {
      setOnboardingOpen(true);
    } else {
      setOnboardingOpen(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const syncLanguage = async () => {
      try {
        const profile = await api.getAgentProfile();
        if (!active) return;
        setLanguage(profile?.language || 'es');
      } catch {
        // ignore profile language errors
      }
    };
    syncLanguage();
    return () => {
      active = false;
    };
  }, [isAuthenticated, setLanguage]);

  const runMigration = async () => {
    setMigrationLoading(true);
    try {
      await api.migrate(migrationPayload);
      localStorage.removeItem(LEGACY_KEYS.positions);
      localStorage.removeItem(LEGACY_KEYS.watchlist);
      localStorage.removeItem(LEGACY_KEYS.config);
      markMigrationPromptDismissed();
      setMigrationPrompt(null);
    } catch {
      markMigrationPromptDismissed();
      setMigrationPrompt(null);
    } finally {
      setMigrationLoading(false);
    }
  };

  const skipMigrationPrompt = () => {
    markMigrationPromptDismissed();
    setMigrationPrompt(null);
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
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const pushImportantNotification = ({ key, title, message, level = 'info', route = null }) => {
    if (!key || !title) return;
    setNotifItems((prev) => {
      const now = Date.now();
      const existing = prev.find((item) => item.key === key);
      if (existing && now - existing.ts < 15 * 60 * 1000) {
        return prev;
      }
      const next = [
        {
          id: `${key}-${now}`,
          key,
          title,
          message: message || '',
          level,
          route,
          read: false,
          ts: now
        },
        ...prev
      ];
      return next.slice(0, 25);
    });
  };

  useEffect(() => {
    if (!Array.isArray(state.realtimeAlerts) || !state.realtimeAlerts.length) return;
    for (const alert of state.realtimeAlerts) {
      const alertId = String(alert?.id || '');
      if (!alertId || processedRealtimeRef.current.has(alertId)) continue;
      processedRealtimeRef.current.add(alertId);
      const type = String(alert?.type || '').toLowerCase();
      if (type !== 'stoploss' && type !== 'takeprofit') continue;
      const symbol = String(alert?.symbol || '').toUpperCase();
      pushImportantNotification({
        key: `risk-${type}-${symbol}`,
        title: type === 'stoploss' ? `Alerta SL en ${symbol}` : `Alerta TP en ${symbol}`,
        message: type === 'stoploss' ? 'Se alcanzó el nivel de stop loss.' : 'Se alcanzó el nivel de take profit.',
        level: type === 'stoploss' ? 'critical' : 'positive',
        route: '/portfolio'
      });
    }
  }, [state.realtimeAlerts]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let active = true;

    const syncInvites = async () => {
      try {
        const out = await api.getReceivedPortfolioInvites();
        if (!active) return;
        const invites = Array.isArray(out?.invitations) ? out.invitations : [];
        invites.forEach((inv) => {
          const id = String(inv?.id || '');
          if (!id || seenInviteRef.current.has(id)) return;
          seenInviteRef.current.add(id);
          pushImportantNotification({
            key: `invite-${id}`,
            title: 'Nueva invitación a portfolio',
            message: `${inv?.invited_by_email || 'Usuario'} te invitó a "${inv?.portfolio_name || 'Portfolio'}".`,
            level: 'info',
            route: '/portfolio'
          });
        });
      } catch {
        // ignore background invite refresh failures
      }
    };

    syncInvites();
    const id = setInterval(syncInvites, 45000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (state.wsStatus !== 'auth_error') return;
    pushImportantNotification({
      key: 'ws-auth-error',
      title: 'Sesión de tiempo real expirada',
      message: 'Reingresá para reconectar WebSocket.',
      level: 'critical',
      route: '/agent'
    });
  }, [state.wsStatus]);

  useEffect(() => {
    if (!backendOffline && !networkOffline) return;
    pushImportantNotification({
      key: networkOffline ? 'network-offline' : 'backend-offline',
      title: networkOffline ? 'Sin conexión de red' : 'Sin conexión con backend',
      message: networkOffline ? 'Mostrando datos en cache.' : 'Modo degradado hasta recuperar conexión.',
      level: 'warning',
      route: '/agent'
    });
  }, [backendOffline, networkOffline]);

  const openNotification = (item) => {
    setNotifItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, read: true } : x)));
    setNotifOpen(false);
    if (item?.route) navigate(item.route);
  };

  const isSuperadmin = String(user?.role || '').toLowerCase() === 'superadmin';

  const loadAdminDashboard = async () => {
    setAdminLoading(true);
    setAdminError('');
    try {
      const out = await api.getAdminDashboard();
      setAdminDashboard(out || null);
    } catch {
      setAdminError('No se pudo cargar el dashboard admin.');
    } finally {
      setAdminLoading(false);
    }
  };

  const openAdmin = async () => {
    setAdminOpen(true);
    await loadAdminDashboard();
  };

  const finishOnboarding = async () => {
    setOnboardingSaving(true);
    try {
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
  const unreadNotifCount = notifItems.filter((item) => !item.read).length;
  const showNewsHeader = location.pathname === '/news' || location.pathname === '/';

  return (
    <div className="app">
      {migrationPrompt && !onboardingOpen && (
        <MigrationModal stats={migrationPrompt} onAccept={runMigration} onSkip={skipMigrationPrompt} loading={migrationLoading} />
      )}

      {onboardingOpen && (
        <OnboardingModal
          onComplete={{ finish: finishOnboarding, enablePush: enablePushFromOnboarding }}
          saving={onboardingSaving}
          pushLoading={onboardingPushLoading}
          pushMessage={onboardingPushMessage}
          pushError={onboardingPushError}
        />
      )}

      <AdminDashboardModal
        open={adminOpen}
        loading={adminLoading}
        error={adminError}
        data={adminDashboard}
        onClose={() => setAdminOpen(false)}
        onRefresh={loadAdminDashboard}
      />

      {showNewsHeader ? (
      <header className="header">
        <div className="top-header card">
          <div className="brand-lockup" aria-label="Horsai">
            <div className="brand-mark-wrap">
              <HorsaiHorseIcon className="brand-mark" />
            </div>
            <h1 className="brand-title">Horsai</h1>
          </div>
          <div className="header-actions">
            {isSuperadmin ? (
              <button type="button" className="icon-btn" aria-label="Admin dashboard" onClick={openAdmin}>
                🛡️
              </button>
            ) : null}
            <div className="notif-menu-wrap" ref={notifMenuRef}>
              <button
                type="button"
                className="icon-btn"
                aria-label="Notificaciones"
                aria-expanded={notifOpen}
                onClick={() => setNotifOpen((prev) => !prev)}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadNotifCount > 0 ? <span className="notif-dot">{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span> : null}
              </button>
              {notifOpen ? (
                <div className="notif-menu card">
                  <div className="notif-menu-head">
                    <strong>Importantes</strong>
                    <button
                      type="button"
                      className="inline-link-btn"
                      onClick={() => setNotifItems((prev) => prev.map((item) => ({ ...item, read: true })))}
                    >
                      Marcar leídas
                    </button>
                  </div>
                  <div className="notif-menu-list">
                    {!notifItems.length ? <div className="muted">Sin notificaciones importantes.</div> : null}
                    {notifItems.map((item) => (
                      <article
                        key={item.id}
                        className={`notif-item ${item.read ? 'is-read' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => openNotification(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openNotification(item);
                          }
                        }}
                      >
                        <div className={`notif-level ${item.level}`}>{item.title}</div>
                        {item.message ? <div className="muted notif-msg">{item.message}</div> : null}
                        <div className="muted notif-time">
                          {new Date(item.ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="user-menu-wrap" ref={userMenuRef}>
              <button
                type="button"
                className="user-avatar"
                aria-label="Menú de usuario"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((prev) => !prev)}
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt=""
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  String(user?.email || 'U').slice(0, 1).toUpperCase()
                )}
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
      ) : null}
      <Navigation />
      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/news" replace />} />
          <Route
            path="/markets"
            element={
              MARKET_VISIBLE ? (
                <RouteBoundary moduleName="Mercados">
                  <Markets />
                </RouteBoundary>
              ) : (
                <Navigate to="/news" replace />
              )
            }
          />
          <Route
            path="/markets/:symbol"
            element={
              MARKET_VISIBLE ? (
                <RouteBoundary moduleName="Detalle de activo">
                  <AssetDetail />
                </RouteBoundary>
              ) : (
                <Navigate to="/news" replace />
              )
            }
          />
          <Route
            path="/ideas"
            element={
              <RouteBoundary moduleName="Ideas">
                <Ideas />
              </RouteBoundary>
            }
          />
          <Route path="/alerts" element={<Navigate to="/ideas" replace />} />
          <Route
            path="/portfolio"
            element={
              <RouteBoundary moduleName="Portfolio">
                <Portfolio />
              </RouteBoundary>
            }
          />
          <Route
            path="/news"
            element={
              <RouteBoundary moduleName="News">
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
            path="/agent"
            element={
              <RouteBoundary moduleName="Your AI Agent">
                <Settings />
              </RouteBoundary>
            }
          />
          <Route path="/settings" element={<Navigate to="/agent" replace />} />
          <Route path="*" element={<Navigate to="/news" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
