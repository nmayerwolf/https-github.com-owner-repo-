import React from 'react';
import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import AssetRow from './common/AssetRow';
import { CATEGORY_OPTIONS, WATCHLIST_CATALOG } from '../utils/constants';

const categoryLabel = {
  all: 'Todos',
  equity: 'Equity',
  crypto: 'Crypto',
  metal: 'Metal',
  commodity: 'Commodity',
  fx: 'FX',
  bond: 'Bond'
};

const Markets = () => {
  const { state, actions } = useApp();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [candidate, setCandidate] = useState('');
  const isStreamingLoad = state.progress.loaded < state.progress.total;

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
    <div className="grid markets-page">
      <section className="card">
        <h2 className="screen-title">Mercados</h2>

        <div className="search-bar">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar símbolo o activo..." />
        </div>

        <div className="pills">
          {CATEGORY_OPTIONS.map((x) => (
            <button key={x} type="button" className={`pill ${category === x ? 'active' : ''}`} onClick={() => setCategory(x)}>
              {categoryLabel[x] || x}
            </button>
          ))}
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

      <section className="card">
        {isStreamingLoad && (
          <div className="markets-loading-note">
            Cargando mercado en segundo plano: {state.progress.loaded}/{state.progress.total}
          </div>
        )}
        <div className="asset-list">
          {isStreamingLoad && !filtered.length
            ? Array.from({ length: 6 }).map((_, idx) => <div key={`mk-skeleton-${idx}`} className="skeleton skeleton-asset" />)
            : null}
          {filtered.map((a) => (
            <AssetRow
              key={a.symbol}
              asset={a}
              to={`/markets/${a.symbol}`}
              action={state.watchlistSymbols.includes(a.symbol) ? () => actions.removeFromWatchlist(a.symbol) : null}
              actionLabel={state.watchlistSymbols.includes(a.symbol) ? 'Quitar' : null}
            />
          ))}
          {!filtered.length && !isStreamingLoad ? <div className="muted">No hay activos para este filtro.</div> : null}
        </div>
      </section>
    </div>
  );
};

export default Markets;
