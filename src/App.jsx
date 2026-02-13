import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api/apiClient';
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
import { WATCHLIST_CATALOG } from './utils/constants';

const HealthBadge = ({ label, ok, detail }) => (
  <span className="badge" title={detail} style={{ background: ok ? '#00E08E22' : '#FF475722', color: ok ? '#00E08E' : '#FF4757' }}>
    {label}
  </span>
);

const MigrationModal = ({ stats, onAccept, onSkip, loading, error }) => (
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
      {error && (
        <div className="card" style={{ marginTop: 8, borderColor: '#FF4757AA' }}>
          {error}
        </div>
      )}
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

const App = () => {
  const { state, actions } = useApp();
  const { isAuthenticated, user, logout } = useAuth();
  const [migrationPrompt, setMigrationPrompt] = useState(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationError, setMigrationError] = useState('');

  const migrationPayload = useMemo(() => {
    try {
      const positions = JSON.parse(localStorage.getItem('nexusfin_portfolio') || '[]');
      const watchlist = JSON.parse(localStorage.getItem('nexusfin_watchlist') || '[]');
      const config = JSON.parse(localStorage.getItem('nexusfin_config') || 'null');

      const catalogBySymbol = Object.fromEntries(WATCHLIST_CATALOG.map((item) => [item.symbol, item]));
      const watchlistObjects = Array.isArray(watchlist)
        ? watchlist
            .map((symbol) => {
              const meta = catalogBySymbol[symbol];
              return {
                symbol,
                name: meta?.name || symbol,
                type: meta?.type || 'stock',
                category: meta?.category || 'equity'
              };
            })
            .filter((item) => !!item.symbol)
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
      setMigrationError('');
      return;
    }

    const positions = migrationPayload.positions.length;
    const watchlist = migrationPayload.watchlist.length;
    const hasConfig = !!migrationPayload.config;

    if (positions || watchlist || hasConfig) {
      setMigrationPrompt({ positions, watchlist, hasConfig });
      setMigrationError('');
    }
  }, [isAuthenticated, migrationPayload]);

  const runMigration = async () => {
    setMigrationLoading(true);
    setMigrationError('');

    try {
      await api.migrate(migrationPayload);
      localStorage.removeItem('nexusfin_portfolio');
      localStorage.removeItem('nexusfin_watchlist');
      localStorage.removeItem('nexusfin_config');
      await actions.refreshRemoteUserData();
      setMigrationPrompt(null);
    } catch (err) {
      if (err?.status === 409) {
        setMigrationError('Tu cuenta ya tiene datos en backend. No migramos los datos locales para evitar duplicados.');
        return;
      }
      setMigrationError('No se pudo migrar ahora. Podés reintentar en unos minutos.');
    } finally {
      setMigrationLoading(false);
    }
  };

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
      {migrationPrompt && (
        <MigrationModal
          stats={migrationPrompt}
          onAccept={runMigration}
          onSkip={() => setMigrationPrompt(null)}
          loading={migrationLoading}
          error={migrationError}
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
