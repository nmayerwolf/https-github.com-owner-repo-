import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCompanyOverview } from '../api/alphavantage';
import { fetchCompanyProfile } from '../api/finnhub';
import { useApp } from '../store/AppContext';
import { formatUSD } from '../utils/format';
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
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [selectedFundamentals, setSelectedFundamentals] = useState({ loading: false, pe: '-', marketCap: '-' });
  const [visibleCount, setVisibleCount] = useState(8);
  const loadMoreRef = useRef(null);
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

  const visibleAssets = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleAssets.length < filtered.length;
  const selectedAsset = useMemo(() => {
    const symbol = String(selectedSymbol || '').toUpperCase();
    if (!symbol) return null;
    return state.assets.find((item) => String(item.symbol || '').toUpperCase() === symbol) || null;
  }, [state.assets, selectedSymbol]);

  const sessionOpen = Number(selectedAsset?.candles?.o?.[selectedAsset?.candles?.o?.length - 1]);
  const sessionClose = Number(selectedAsset?.candles?.c?.[selectedAsset?.candles?.c?.length - 1]);

  useEffect(() => {
    setVisibleCount(8);
  }, [category, query, state.watchlistSymbols.length]);

  useEffect(() => {
    if (selectedSymbol) return;
    const first = filtered[0]?.symbol;
    if (first) setSelectedSymbol(first);
  }, [selectedSymbol, filtered]);

  useEffect(() => {
    let active = true;
    const symbol = String(selectedSymbol || '').toUpperCase();
    if (!symbol || selectedAsset?.category !== 'equity') {
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
  }, [selectedSymbol, selectedAsset?.category]);

  useEffect(() => {
    if (!hasMore) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const node = loadMoreRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => Math.min(prev + 8, filtered.length));
        }
      },
      { rootMargin: '120px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

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
            <select className="select-field" aria-label="Activo para agregar a watchlist" value={candidate} onChange={(e) => setCandidate(e.target.value)}>
              <option value="">Seleccioná un activo...</option>
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

        <div className="row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
          <label className="label" style={{ margin: 0, flex: 1 }}>
            <span className="muted">Activo seleccionado</span>
            <select className="select-field" aria-label="Activo seleccionado para resumen rápido" value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>
              {filtered.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} - {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedAsset ? (
          <div className="ind-grid" style={{ marginTop: 10 }}>
            <div className="ind-cell">
              <div className="ind-label">Apertura</div>
              <div className="ind-val mono">{formatUSD(Number.isFinite(sessionOpen) ? sessionOpen : null)}</div>
            </div>
            <div className="ind-cell">
              <div className="ind-label">Cierre</div>
              <div className="ind-val mono">{formatUSD(Number.isFinite(sessionClose) ? sessionClose : null)}</div>
            </div>
            <div className="ind-cell">
              <div className="ind-label">P/E</div>
              <div className="ind-val mono">{selectedFundamentals.loading ? '...' : selectedFundamentals.pe}</div>
            </div>
            <div className="ind-cell">
              <div className="ind-label">Market Cap</div>
              <div className="ind-val mono">{selectedFundamentals.loading ? '...' : selectedFundamentals.marketCap}</div>
            </div>
          </div>
        ) : null}
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
          {visibleAssets.map((a) => (
            <AssetRow
              key={a.symbol}
              asset={a}
              to={`/markets/${a.symbol}`}
              action={state.watchlistSymbols.includes(a.symbol) ? () => actions.removeFromWatchlist(a.symbol) : null}
              actionLabel={state.watchlistSymbols.includes(a.symbol) ? 'Quitar' : null}
            />
          ))}
          {hasMore ? (
            <div className="markets-load-more">
              <button type="button" onClick={() => setVisibleCount((prev) => Math.min(prev + 8, filtered.length))} aria-label="Cargar más activos">
                Cargar más
              </button>
              <div ref={loadMoreRef} className="markets-load-sentinel" aria-hidden="true" />
            </div>
          ) : null}
          {!filtered.length && !isStreamingLoad ? <div className="muted">No hay activos para este filtro.</div> : null}
        </div>
      </section>
    </div>
  );
};

export default Markets;
