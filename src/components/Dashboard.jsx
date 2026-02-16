import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCompanyOverview } from '../api/alphavantage';
import { fetchCompanyProfile } from '../api/finnhub';
import { useApp } from '../store/AppContext';
import { formatPct, formatUSD, shortDate } from '../utils/format';
import AssetRow from './common/AssetRow';
import AlertCard from './common/AlertCard';
import NewsSection from './NewsSection';

const Dashboard = () => {
  const { state } = useApp();
  const navigate = useNavigate();
  const [alertVisibleCount, setAlertVisibleCount] = useState(3);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [selectedFundamentals, setSelectedFundamentals] = useState({ loading: false, pe: '-', marketCap: '-' });
  const screenerSuggestions = [
    { label: 'Acciones oversold', query: 'Acciones con RSI bajo y confluencia alcista', category: 'equity' },
    { label: 'Crypto momentum', query: 'Cryptos con momentum positivo y volumen creciente', category: 'crypto' },
    { label: 'Metales defensivos', query: 'Metales defensivos con tendencia estable', category: 'metal' },
    { label: 'Bonds con yield', query: 'Bonos con mejor rendimiento y riesgo moderado', category: 'bond' }
  ];

  const portfolio = useMemo(() => {
    const assetsBySymbol = Object.fromEntries(state.assets.map((a) => [a.symbol, a]));
    const active = state.positions.filter((p) => !p.sellDate);

    let invested = 0;
    let value = 0;
    active.forEach((p) => {
      invested += p.buyPrice * p.quantity;
      const current = assetsBySymbol[p.symbol]?.price ?? p.buyPrice;
      value += current * p.quantity;
    });

    const pnl = value - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { invested, value, pnl, pnlPct, activeCount: active.length };
  }, [state.positions, state.assets]);

  const watchlistAssets = useMemo(() => {
    const bySymbol = Object.fromEntries(state.assets.map((asset) => [String(asset.symbol || '').toUpperCase(), asset]));
    const selected = state.watchlistSymbols.map((symbol) => bySymbol[String(symbol || '').toUpperCase()]).filter(Boolean);
    if (selected.length) return selected;
    return state.assets.slice(0, 10);
  }, [state.assets, state.watchlistSymbols]);
  const performance = useMemo(
    () => ({
      hitRate: Number(state.alerts.length ? (state.alerts.filter((a) => String(a.type).includes('compra')).length / state.alerts.length) * 100 : 0),
      avgReturn: portfolio.invested ? (portfolio.pnl / portfolio.invested) * 100 : 0,
      drawdown: Math.min(0, portfolio.pnlPct - 5),
      rr: 2.5
    }),
    [state.alerts, portfolio.invested, portfolio.pnl, portfolio.pnlPct]
  );
  const visibleAlerts = useMemo(() => state.alerts.slice(0, alertVisibleCount), [state.alerts, alertVisibleCount]);
  const hasMoreAlerts = visibleAlerts.length < state.alerts.length;
  const selectedAsset = useMemo(() => {
    if (!selectedAlert?.symbol) return null;
    const symbol = String(selectedAlert.symbol).toUpperCase();
    return state.assets.find((item) => String(item.symbol || '').toUpperCase() === symbol) || null;
  }, [selectedAlert, state.assets]);

  useEffect(() => {
    setAlertVisibleCount(3);
  }, [state.alerts.length]);

  useEffect(() => {
    let active = true;
    const symbol = String(selectedAlert?.symbol || '').toUpperCase();
    if (!symbol) {
      setSelectedFundamentals({ loading: false, pe: '-', marketCap: '-' });
      return () => {
        active = false;
      };
    }

    if (selectedAsset?.category !== 'equity') {
      setSelectedFundamentals({ loading: false, pe: '-', marketCap: '-' });
      return () => {
        active = false;
      };
    }

    setSelectedFundamentals({ loading: true, pe: '-', marketCap: '-' });
    Promise.all([fetchCompanyOverview(symbol), fetchCompanyProfile(symbol)])
      .then(([overview, profile]) => {
        if (!active) return;
        setSelectedFundamentals({
          loading: false,
          pe: overview?.PERatio || '-',
          marketCap: overview?.MarketCapitalization || profile?.marketCapitalization || '-'
        });
      })
      .catch(() => {
        if (!active) return;
        setSelectedFundamentals({ loading: false, pe: '-', marketCap: '-' });
      });

    return () => {
      active = false;
    };
  }, [selectedAlert, selectedAsset?.category]);

  return (
    <div className="dashboard-page">
      <section className="portfolio-hero card">
        <div className="portfolio-label">Valor del portfolio</div>
        <div className="portfolio-value mono">{formatUSD(portfolio.value)}</div>
        <div className={`portfolio-change ${portfolio.pnl >= 0 ? 'up' : 'down'} mono`}>
          {formatUSD(portfolio.pnl)} ({formatPct(portfolio.pnlPct)})
        </div>
        <div className="portfolio-stats-grid">
          <div className="portfolio-stat">
            <div className="portfolio-stat-label">Capital invertido</div>
            <div className="portfolio-stat-value mono">{formatUSD(portfolio.invested)}</div>
          </div>
          <div className="portfolio-stat">
            <div className="portfolio-stat-label">Posiciones activas</div>
            <div className="portfolio-stat-value mono">{portfolio.activeCount}</div>
          </div>
          <div className="portfolio-stat">
            <div className="portfolio-stat-label">Activos en watchlist</div>
            <div className="portfolio-stat-value mono">{state.watchlistSymbols.length}</div>
          </div>
        </div>
        <div className="muted">Actualizado {state.lastUpdated ? shortDate(new Date(state.lastUpdated).toISOString()) : '-'}</div>
      </section>

      <section>
        <div className="section-header-inline">
          <h3 className="section-title">Señales del AI Agent</h3>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {hasMoreAlerts ? (
              <button type="button" className="inline-link-btn" onClick={() => setAlertVisibleCount((prev) => prev + 3)}>
                Ver más
              </button>
            ) : null}
          </div>
        </div>
        <div className="muted" style={{ marginBottom: 8 }}>
          Seleccioná una señal para ver recomendación, confluencia y niveles sugeridos.
        </div>
        <div className="alerts-scroll">
          {visibleAlerts.map((a) => (
            <AlertCard key={a.id} alert={a} onClick={() => setSelectedAlert(a)} />
          ))}
          {!state.alerts.length ? <div className="card muted">Sin señales activas.</div> : null}
        </div>
      </section>

      <section className="ai-card">
        <div className="ai-card-title">AI Screener</div>
        <div className="ai-card-sub">Explorá oportunidades por contexto en lenguaje natural.</div>
        <div className="ai-suggestions">
          {screenerSuggestions.map((item) => (
            <button
              key={item.label}
              type="button"
              className="ai-sug"
              onClick={() => {
                const params = new URLSearchParams({
                  q: item.query,
                  category: item.category,
                  autorun: '1'
                });
                navigate(`/screener?${params.toString()}`);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <NewsSection title="Noticias" />

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Watchlist</h3>
        </div>
        <div className="asset-list">
          {watchlistAssets.map((asset) => (
            <AssetRow key={asset.symbol} asset={asset} to={`/markets/${asset.symbol}`} />
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Performance del Agente</h3>
        </div>
        <div className="muted" style={{ marginBottom: 8 }}>
          Métricas agregadas sobre señales activas y resultado del portfolio actual.
        </div>
        <div className="ind-grid">
          <div className="ind-cell">
            <div className="ind-label">Hit Rate</div>
            <div className="ind-val mono">{formatPct(performance.hitRate)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Retorno Promedio</div>
            <div className="ind-val mono">{formatPct(performance.avgReturn)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Pérdida Promedio</div>
            <div className="ind-val mono">{formatPct(performance.drawdown)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Risk/Reward</div>
            <div className="ind-val mono">1:{performance.rr.toFixed(1)}</div>
          </div>
        </div>
      </section>

      {selectedAlert ? (
        <section className="modal-backdrop" role="presentation" onClick={() => setSelectedAlert(null)}>
          <article className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ marginBottom: 6 }}>{selectedAlert.symbol || 'Señal'}</h3>
                <div className="muted">{selectedAlert.title || selectedAlert.recommendation || 'Recomendación del AI Agent'}</div>
              </div>
              <button type="button" onClick={() => setSelectedAlert(null)}>
                Cerrar
              </button>
            </div>
            <div className="grid" style={{ marginTop: 10 }}>
              <div className="ind-cell">
                <div className="ind-label">Confluencia</div>
                <div className="ind-val mono">
                  {Number(selectedAlert.net ?? selectedAlert.confluenceBull ?? 0) - Number(selectedAlert.confluenceBear ?? 0)}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Confluencia = puntos alcistas - puntos bajistas. Un valor negativo (ej. -4) indica sesgo bajista.
                </div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Apertura</div>
                <div className="ind-val mono">{formatUSD(Number(selectedAsset?.candles?.o?.[selectedAsset?.candles?.o?.length - 1]))}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Cierre</div>
                <div className="ind-val mono">{formatUSD(Number(selectedAsset?.candles?.c?.[selectedAsset?.candles?.c?.length - 1]))}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">P/E</div>
                <div className="ind-val mono">{selectedFundamentals.loading ? '...' : selectedFundamentals.pe}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Market Cap</div>
                <div className="ind-val mono">{selectedFundamentals.loading ? '...' : selectedFundamentals.marketCap}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Stop Loss</div>
                <div className="ind-val mono">{selectedAlert.stopLoss ? formatUSD(selectedAlert.stopLoss) : '-'}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Take Profit</div>
                <div className="ind-val mono">{selectedAlert.takeProfit ? formatUSD(selectedAlert.takeProfit) : '-'}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Confianza</div>
                <div className="ind-val mono">{String(selectedAlert.confidence || 'high')}</div>
              </div>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
};

export default Dashboard;
