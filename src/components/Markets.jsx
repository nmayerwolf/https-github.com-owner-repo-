import React from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { calculateConfluence } from '../engine/confluence';
import Sparkline from './common/Sparkline';
import CategoryBadge from './common/CategoryBadge';
import { formatPct, formatUSD } from '../utils/format';
import { CATEGORY_OPTIONS, WATCHLIST_CATALOG } from '../utils/constants';

const sourceLabel = (source) => {
  if (source === 'alphavantage_macro') return 'Alpha';
  return 'Finnhub';
};

const sourceColor = (source) => (source === 'alphavantage_macro' ? '#FBBF24' : '#60A5FA');

const Markets = () => {
  const { state, actions } = useApp();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [candidate, setCandidate] = useState('');

  const filtered = useMemo(() => {
    return state.assets.filter((a) => {
      const okCategory = category === 'all' || a.category === category;
      const q = query.toLowerCase();
      const okText = !q || a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
      return okCategory && okText;
    });
  }, [state.assets, category, query]);

  const options = useMemo(
    () => WATCHLIST_CATALOG.filter((x) => !state.watchlistSymbols.includes(x.symbol)),
    [state.watchlistSymbols]
  );

  return (
    <div className="grid">
      <section className="card">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {CATEGORY_OPTIONS.map((x) => (
            <button key={x} type="button" onClick={() => setCategory(x)} style={{ borderColor: category === x ? '#00E08E' : undefined }}>
              {x}
            </button>
          ))}
        </div>
        <div className="label" style={{ marginTop: 8 }}>
          <span className="muted">Buscar activo</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="AAPL, BTC, EUR/USD..." />
        </div>
        <div className="row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
          <label className="label" style={{ margin: 0, flex: 1 }}>
            <span className="muted">Agregar a watchlist</span>
            <select value={candidate} onChange={(e) => setCandidate(e.target.value)}>
              <option value="">Seleccionar activo...</option>
              {options.map((x) => (
                <option key={x.symbol} value={x.symbol}>
                  {x.symbol} - {x.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              actions.addToWatchlist(candidate);
              setCandidate('');
            }}
            disabled={!candidate}
          >
            Agregar
          </button>
        </div>
      </section>

      {filtered.map((a) => {
        const signal = calculateConfluence(a, state.config);
        const inWatchlist = state.watchlistSymbols.includes(a.symbol);
        return (
          <article key={a.symbol} className="card">
            <div className="row">
              <div>
                <strong>{a.symbol}</strong> <span className="muted">{a.name}</span>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <span className="badge" style={{ background: `${sourceColor(a.source)}22`, color: sourceColor(a.source) }}>
                  {sourceLabel(a.source)}
                </span>
                <CategoryBadge category={a.category} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <span>{formatUSD(a.price)}</span>
              <span className={a.changePercent >= 0 ? 'up' : 'down'}>{formatPct(a.changePercent)}</span>
              <span className="muted">RSI {a.indicators?.rsi?.toFixed(1) ?? '-'}</span>
            </div>
            <Sparkline values={a.candles?.c?.slice(-30) || []} color={a.changePercent >= 0 ? '#00E08E' : '#FF4757'} />
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">Confluencia: {signal.net}</span>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {inWatchlist && (
                  <button type="button" onClick={() => actions.removeFromWatchlist(a.symbol)}>
                    Quitar
                  </button>
                )}
                <Link to={`/markets/${a.symbol}`}>Ver detalle</Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default Markets;
