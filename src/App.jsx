import { Navigate, Route, Routes } from 'react-router-dom';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import Markets from './components/Markets';
import Alerts from './components/Alerts';
import Portfolio from './components/Portfolio';
import Settings from './components/Settings';
import Screener from './components/Screener';
import LoadingScreen from './components/common/LoadingScreen';
import AssetDetail from './components/AssetDetail';
import { useApp } from './store/AppContext';

const HealthBadge = ({ label, ok, detail }) => (
  <span className="badge" title={detail} style={{ background: ok ? '#00E08E22' : '#FF475722', color: ok ? '#00E08E' : '#FF4757' }}>
    {label}
  </span>
);

const App = () => {
  const { state, actions } = useApp();

  if (state.loading) {
    return <LoadingScreen loaded={state.progress.loaded} total={state.progress.total} />;
  }

  const finnhubOk = state.apiHealth.finnhub.errors === 0 || state.apiHealth.finnhub.calls > state.apiHealth.finnhub.errors;
  const alphaOk = state.apiHealth.alphavantage.errors === 0 || state.apiHealth.alphavantage.calls > state.apiHealth.alphavantage.errors;
  const claudeOk = state.apiHealth.claude.errors === 0;

  return (
    <div className="app">
      <header className="header">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1>NexusFin</h1>
            <p className="muted">Monitoreo financiero en tiempo real</p>
          </div>
          <span className="badge" style={{ background: '#60A5FA22', color: '#60A5FA' }}>
            WS: {state.wsStatus}
          </span>
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
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
