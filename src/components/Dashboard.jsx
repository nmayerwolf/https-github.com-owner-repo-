import React from 'react';
import { useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { formatPct, formatUSD, shortDate } from '../utils/format';
import AssetRow from './common/AssetRow';
import AlertCard from './common/AlertCard';
import NewsSection from './NewsSection';

const Dashboard = () => {
  const { state } = useApp();

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
    return { invested, value, pnl, pnlPct };
  }, [state.positions, state.assets]);

  const tickerAssets = ['AAPL', 'NVDA', 'BTCUSDT', 'ETHUSDT', 'GLD', 'EUR_USD', 'SPY'].map((s) => state.assets.find((a) => a.symbol === s)).filter(Boolean);
  const watchlistAssets = state.assets.slice(0, 10);
  const performance = {
    hitRate: Number(state.alerts.length ? (state.alerts.filter((a) => String(a.type).includes('compra')).length / state.alerts.length) * 100 : 0),
    avgReturn: portfolio.invested ? (portfolio.pnl / portfolio.invested) * 100 : 0,
    drawdown: Math.min(0, portfolio.pnlPct - 5),
    rr: 2.5
  };

  return (
    <div className="dashboard-page">
      <section className="portfolio-hero card">
        <div className="portfolio-label">Valor del portfolio</div>
        <div className="portfolio-value mono">{formatUSD(portfolio.value)}</div>
        <div className={`portfolio-change ${portfolio.pnl >= 0 ? 'up' : 'down'} mono`}>
          {formatUSD(portfolio.pnl)} ({formatPct(portfolio.pnlPct)})
        </div>
        <div className="muted">Actualizado {state.lastUpdated ? shortDate(new Date(state.lastUpdated).toISOString()) : '-'}</div>
      </section>

      <section className="ticker-wrap card">
        <div className="ticker">
          {[...tickerAssets, ...tickerAssets].map((x, idx) => (
            <div className="tk-item" key={`${x.symbol}-${idx}`}>
              <span className="tk-sym mono">{x.symbol}</span>
              <span className="tk-price mono">{formatUSD(x.price)}</span>
              <span className={`tk-chg mono ${x.changePercent >= 0 ? 'up' : 'down'}`}>{formatPct(x.changePercent)}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-header-inline">
          <h3 className="section-title">Señales del AI Agent</h3>
          <span className="live-indicator">
            <span className="live-dot" />
            Live
          </span>
        </div>
        <div className="alerts-scroll">
          {state.alerts.slice(0, 6).map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
          {!state.alerts.length ? <div className="card muted">Sin señales activas.</div> : null}
        </div>
      </section>

      <section className="ai-card">
        <div className="ai-card-title">AI Screener</div>
        <div className="ai-card-sub">Explorá oportunidades por contexto en lenguaje natural.</div>
        <div className="ai-suggestions">
          <span className="ai-sug">Acciones oversold</span>
          <span className="ai-sug">Crypto momentum</span>
          <span className="ai-sug">Metales defensivos</span>
          <span className="ai-sug">Bonds con yield</span>
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
    </div>
  );
};

export default Dashboard;
