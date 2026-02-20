import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api/apiClient';
import { subscribeBrowserPush } from './lib/notifications';
import Navigation from './components/Navigation';
import Markets from './components/Markets';
import Agent from './components/Agent';
import Portfolio from './components/Portfolio';
import Brief from './components/Brief';
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
import { useLanguage } from './store/LanguageContext';

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

const MigrationModal = ({ stats, onAccept, onSkip, loading, isSpanish }) => (
  <div className="modal-backdrop" role="presentation">
    <section className="modal-card" role="dialog" aria-modal="true">
      <h3>{isSpanish ? 'Migrar datos locales' : 'Migrate local data'}</h3>
      <p className="muted" style={{ marginTop: 8 }}>
        {isSpanish ? 'Encontramos datos locales de Fase 1.' : 'We found local data from Phase 1.'}
      </p>
      <div className="grid" style={{ marginTop: 8 }}>
        <div className="row">
          <span>{isSpanish ? 'Posiciones' : 'Positions'}</span>
          <strong>{stats.positions}</strong>
        </div>
        <div className="row">
          <span>{isSpanish ? 'Seguimiento' : 'Watchlist'}</span>
          <strong>{stats.watchlist}</strong>
        </div>
        <div className="row">
          <span>{isSpanish ? 'Ajustes' : 'Settings'}</span>
          <strong>{stats.hasConfig ? (isSpanish ? 'Sí' : 'Yes') : 'No'}</strong>
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" onClick={onSkip} disabled={loading}>
          {isSpanish ? 'Más tarde' : 'Later'}
        </button>
        <button type="button" onClick={onAccept} disabled={loading}>
          {loading ? (isSpanish ? 'Migrando...' : 'Migrating...') : isSpanish ? 'Migrar ahora' : 'Migrate now'}
        </button>
      </div>
    </section>
  </div>
);

const RouteBoundary = ({ moduleName, children }) => <ErrorBoundary moduleName={moduleName}>{children}</ErrorBoundary>;

const OnboardingModal = ({ onComplete, saving, pushLoading, pushMessage, pushError, isSpanish }) => (
  <div className="modal-backdrop" role="presentation">
    <section className="modal-card" role="dialog" aria-modal="true">
      <div className="row">
        <h3>{isSpanish ? 'Bienvenido a Horsai' : 'Welcome to Horsai'}</h3>
        <span className="badge" style={{ background: '#60A5FA22', color: '#60A5FA' }}>{isSpanish ? 'Inicio rápido' : 'Quick start'}</span>
      </div>

      <div className="grid" style={{ marginTop: 10 }}>
        <p className="muted">
          {isSpanish
            ? 'Podés activar notificaciones ahora (opcional). El perfil inversor se configura automáticamente.'
            : 'You can enable notifications now (optional). Your investment profile is configured automatically.'}
        </p>
        <button type="button" onClick={onComplete.enablePush} disabled={pushLoading}>
          {pushLoading ? (isSpanish ? 'Activando...' : 'Enabling...') : isSpanish ? 'Activar notificaciones' : 'Enable push notifications'}
        </button>
        {pushMessage && <div className="card" style={{ borderColor: '#00E08E88' }}>{pushMessage}</div>}
        {pushError && <div className="card" style={{ borderColor: '#FF4757AA' }}>{pushError}</div>}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" onClick={onComplete.finish} disabled={saving}>
          {saving ? (isSpanish ? 'Finalizando...' : 'Finishing...') : isSpanish ? 'Finalizar incorporación' : 'Finish onboarding'}
        </button>
      </div>
    </section>
  </div>
);

const AdminDashboardModal = ({ open, loading, error, data, onClose, onRefresh, isSpanish }) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>{isSpanish ? 'Panel de administración' : 'Admin dashboard'}</h3>
          <button type="button" className="icon-btn" aria-label={isSpanish ? 'Cerrar panel de administración' : 'Close admin panel'} onClick={onClose}>
            ✕
          </button>
        </div>
        {loading ? <p className="muted" style={{ marginTop: 8 }}>{isSpanish ? 'Cargando métricas...' : 'Loading metrics...'}</p> : null}
        {error ? <div className="card" style={{ marginTop: 8, borderColor: '#FF4757AA' }}>{error}</div> : null}
        {!loading && !error && data ? (
          <>
            <div className="grid" style={{ marginTop: 8, gap: 8 }}>
              <div className="row"><span>{isSpanish ? 'Usuarios' : 'Users'}</span><strong>{data.total_users}</strong></div>
              <div className="row"><span>{isSpanish ? 'Activos hoy' : 'Active today'}</span><strong>{data.active_today}</strong></div>
              <div className="row"><span>{isSpanish ? 'Costo hoy' : 'Cost today'}</span><strong>${Number(data.cost_today_usd || 0).toFixed(4)}</strong></div>
              <div className="row"><span>{isSpanish ? 'Mes' : 'Month'}</span><strong>${Number(data.cost_this_month_usd || 0).toFixed(4)}</strong></div>
            </div>
            <div style={{ marginTop: 10 }}>
              <strong>{isSpanish ? 'Top usuarios hoy' : 'Top users today'}</strong>
              <div className="grid" style={{ marginTop: 6, gap: 6 }}>
                {Array.isArray(data.top_users_today) && data.top_users_today.length ? (
                  data.top_users_today.map((row) => (
                    <div key={row.email} className="row">
                      <span className="mono" style={{ fontSize: 12 }}>{row.email}</span>
                      <strong>${Number(row.cost_usd || 0).toFixed(4)} · {Number(row.calls || 0)} {isSpanish ? 'llamadas' : 'calls'}</strong>
                    </div>
                  ))
                ) : (
                  <div className="muted">{isSpanish ? 'Sin actividad registrada hoy.' : 'No activity registered today.'}</div>
                )}
              </div>
            </div>
          </>
        ) : null}
        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          <button type="button" className="inline-link-btn" onClick={onRefresh} disabled={loading}>
            {isSpanish ? 'Actualizar' : 'Refresh'}
          </button>
          <button type="button" onClick={onClose}>{isSpanish ? 'Cerrar' : 'Close'}</button>
        </div>
      </section>
    </div>
  );
};

const App = () => {
  const navigate = useNavigate();
  const { isSpanish } = useLanguage();
  const { state } = useApp();
  const { isAuthenticated, user, logout, loading: authLoading, completeOnboarding } = useAuth();
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
        title: type === 'stoploss' ? (isSpanish ? `Alerta de límite de pérdida en ${symbol}` : `Stop-loss alert on ${symbol}`) : isSpanish ? `Alerta de toma de ganancia en ${symbol}` : `Take-profit alert on ${symbol}`,
        message: type === 'stoploss' ? (isSpanish ? 'Se alcanzó el nivel de límite de pérdida.' : 'Stop-loss level was reached.') : isSpanish ? 'Se alcanzó el nivel de toma de ganancia.' : 'Take-profit level was reached.',
        level: type === 'stoploss' ? 'critical' : 'positive',
        route: '/portfolio'
      });
    }
  }, [state.realtimeAlerts, isSpanish]);

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
            title: isSpanish ? 'Nueva invitación al portafolio' : 'New portfolio invitation',
            message: isSpanish
              ? `${inv?.invited_by_email || 'Usuario'} te invitó a "${inv?.portfolio_name || 'Portafolio'}".`
              : `${inv?.invited_by_email || 'User'} invited you to "${inv?.portfolio_name || 'Portfolio'}".`,
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
      title: isSpanish ? 'Sesión de tiempo real expirada' : 'Realtime session expired',
      message: isSpanish ? 'Volvé a iniciar sesión para reconectar el canal en tiempo real.' : 'Sign in again to reconnect realtime channel.',
      level: 'critical',
      route: '/settings'
    });
  }, [state.wsStatus, isSpanish]);

  useEffect(() => {
    if (!backendOffline && !networkOffline) return;
    pushImportantNotification({
      key: networkOffline ? 'network-offline' : 'backend-offline',
      title: networkOffline ? (isSpanish ? 'Sin conexión de red' : 'Network offline') : isSpanish ? 'Sin conexión con backend' : 'Backend offline',
      message: networkOffline
        ? isSpanish
          ? 'Mostrando datos en caché.'
          : 'Showing cached data.'
        : isSpanish
          ? 'Modo degradado hasta recuperar conexión.'
          : 'Degraded mode until connection is restored.',
      level: 'warning',
      route: '/settings'
    });
  }, [backendOffline, networkOffline, isSpanish]);

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
      setAdminError(isSpanish ? 'No se pudo cargar el panel de administración.' : 'Could not load admin dashboard.');
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
        setOnboardingPushMessage(isSpanish ? 'Notificaciones activadas.' : 'Notifications enabled.');
      } else {
        setOnboardingPushError(
          isSpanish ? 'No se pudieron activar notificaciones en este dispositivo.' : 'Could not enable notifications on this device.'
        );
      }
    } catch {
      setOnboardingPushError(isSpanish ? 'No se pudieron activar notificaciones.' : 'Could not enable notifications.');
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
    ? new Date(state.lastUpdated).toLocaleString(isSpanish ? 'es-AR' : 'en-US', { dateStyle: 'short', timeStyle: 'medium' })
    : isSpanish
      ? 'sin datos'
      : 'no data';
  const backendLastOkLabel = backendLastOkAt
    ? new Date(backendLastOkAt).toLocaleString(isSpanish ? 'es-AR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })
    : null;
  const unreadNotifCount = notifItems.filter((item) => !item.read).length;

  return (
    <div className="app">
      {migrationPrompt && !onboardingOpen && (
        <MigrationModal stats={migrationPrompt} onAccept={runMigration} onSkip={skipMigrationPrompt} loading={migrationLoading} isSpanish={isSpanish} />
      )}

      {onboardingOpen && (
        <OnboardingModal
          onComplete={{ finish: finishOnboarding, enablePush: enablePushFromOnboarding }}
          saving={onboardingSaving}
          pushLoading={onboardingPushLoading}
          pushMessage={onboardingPushMessage}
          pushError={onboardingPushError}
          isSpanish={isSpanish}
        />
      )}

      <AdminDashboardModal
        open={adminOpen}
        loading={adminLoading}
        error={adminError}
        data={adminDashboard}
        onClose={() => setAdminOpen(false)}
        onRefresh={loadAdminDashboard}
        isSpanish={isSpanish}
      />

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
              <button type="button" className="icon-btn" aria-label={isSpanish ? 'Panel de administración' : 'Admin dashboard'} onClick={openAdmin}>
                🛡️
              </button>
            ) : null}
            <div className="notif-menu-wrap" ref={notifMenuRef}>
              <button
                type="button"
                className="icon-btn"
                aria-label={isSpanish ? 'Notificaciones' : 'Notifications'}
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
                    <strong>{isSpanish ? 'Importantes' : 'Important'}</strong>
                    <button
                      type="button"
                      className="inline-link-btn"
                      onClick={() => setNotifItems((prev) => prev.map((item) => ({ ...item, read: true })))}
                    >
                      {isSpanish ? 'Marcar leídas' : 'Mark read'}
                    </button>
                  </div>
                  <div className="notif-menu-list">
                    {!notifItems.length ? <div className="muted">{isSpanish ? 'Sin notificaciones importantes.' : 'No important notifications.'}</div> : null}
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
                          {new Date(item.ts).toLocaleString(isSpanish ? 'es-AR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button type="button" className="icon-btn" aria-label={isSpanish ? 'Buscar' : 'Search'}>
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.8-3.8" />
              </svg>
            </button>
            <div className="user-menu-wrap" ref={userMenuRef}>
              <button
                type="button"
                className="user-avatar"
                aria-label={isSpanish ? 'Menú de usuario' : 'User menu'}
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
                    aria-label={isSpanish ? 'Configuración' : 'Settings'}
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/settings');
                    }}
                  >
                    {isSpanish ? 'Configuración' : 'Settings'}
                  </button>
                  <button
                    type="button"
                    className="logout-btn"
                    aria-label={isSpanish ? 'Cerrar sesión' : 'Sign out'}
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                  >
                    {isSpanish ? 'Cerrar sesión' : 'Sign out'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <span className="badge" style={{ background: '#8CC8FF22', color: '#8CC8FF' }}>
            {isSpanish ? `Actualizado: ${lastUpdatedLabel}` : `Updated: ${lastUpdatedLabel}`}
          </span>
        </div>

        {(backendOffline || networkOffline) && (
          <section className="card" style={{ marginTop: 8, borderColor: '#FBBF24AA' }} role="status" aria-live="polite">
            <strong>{networkOffline ? (isSpanish ? 'Sin conexión' : 'No connection') : isSpanish ? 'Modo offline' : 'Offline mode'}</strong>
            <div className="muted">
              {networkOffline
                ? isSpanish
                  ? 'Tu dispositivo está sin red. Mostramos datos guardados cuando están disponibles.'
                  : 'Your device is offline. Cached data is shown when available.'
                : isSpanish
                  ? 'No se pudo conectar con el backend. Verificá tu conexión o VITE_API_URL.'
                  : 'Could not connect to backend. Check your network or VITE_API_URL.'}
            </div>
            {!networkOffline && backendLastOkLabel ? (
              <div className="muted" style={{ marginTop: 6 }}>
                {isSpanish ? `Última sincronización backend: ${backendLastOkLabel}` : `Last backend sync: ${backendLastOkLabel}`}
              </div>
            ) : null}
            {!networkOffline && backendFailures > 0 ? (
              <div className="muted">{isSpanish ? `Reintentos fallidos: ${backendFailures}` : `Failed retries: ${backendFailures}`}</div>
            ) : null}
          </section>
        )}

      </header>
      <Navigation />
      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/brief" replace />} />
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
            path="/brief"
            element={
              <RouteBoundary moduleName="Brief">
                <Brief />
              </RouteBoundary>
            }
          />
          <Route
            path="/agent"
            element={
              <RouteBoundary moduleName="Agent">
                <Agent />
              </RouteBoundary>
            }
          />
          <Route path="/ideas" element={<Navigate to="/agent" replace />} />
          <Route path="/alerts" element={<Navigate to="/agent" replace />} />
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
              <Navigate to="/brief" replace />
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
              <RouteBoundary moduleName="Settings">
                <Settings />
              </RouteBoundary>
            }
          />
          <Route path="*" element={<Navigate to="/brief" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
