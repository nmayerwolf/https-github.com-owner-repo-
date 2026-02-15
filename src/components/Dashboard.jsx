import React from 'react';
import { useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { formatPct, formatUSD } from '../utils/format';

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

  const indices = ['SPY', 'QQQ', 'DIA', 'BTCUSDT'].map((s) => state.assets.find((a) => a.symbol === s)).filter(Boolean);

  return (
    <div className="grid">
      <section className="card">
        <h2>Resumen Portfolio</h2>
        <div className="grid grid-2" style={{ marginTop: 8 }}>
          <div>
            <div className="muted">Valor actual</div>
            <strong>{formatUSD(portfolio.value)}</strong>
          </div>
          <div>
            <div className="muted">P&L total</div>
            <strong className={portfolio.pnl >= 0 ? 'up' : 'down'}>
              {formatUSD(portfolio.pnl)} ({formatPct(portfolio.pnlPct)})
            </strong>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Índices</h2>
        <div className="grid" style={{ marginTop: 8 }}>
          {indices.map((x) => (
            <div className="row" key={x.symbol}>
              <strong>{x.symbol}</strong>
              <span>{formatUSD(x.price)}</span>
              <span className={x.changePercent >= 0 ? 'up' : 'down'}>{formatPct(x.changePercent)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Carga de mercado</h2>
        <div className="grid" style={{ marginTop: 8 }}>
          <div className="row">
            <span className="muted">Watchlist base</span>
            <span>
              {state.progress.loaded}/{state.progress.total}
            </span>
          </div>
          <div className="row">
            <span className="muted">Macro (Alpha Vantage)</span>
            <span>
              {state.macroStatus === 'loading' && 'Cargando...'}
              {state.macroStatus === 'loaded' && 'Listo'}
              {state.macroStatus === 'error' && 'Error'}
              {state.macroStatus === 'idle' && 'Pendiente'}
            </span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Alertas recientes</h2>
        <div className="grid" style={{ marginTop: 8 }}>
          {state.alerts.slice(0, 5).map((a) => (
            <div key={a.id} className="row">
              <span>{a.title}</span>
              <span className="muted">{a.confidence || 'high'}</span>
            </div>
          ))}
          {!state.alerts.length && <div className="muted">Sin alertas por ahora.</div>}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
