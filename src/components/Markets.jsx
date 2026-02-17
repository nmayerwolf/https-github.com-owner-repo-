import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCompanyOverview } from '../api/alphavantage';
import { api } from '../api/apiClient';
import { fetchCompanyProfile } from '../api/finnhub';
import { useApp } from '../store/AppContext';
import { formatUSD } from '../utils/format';
import AssetRow from './common/AssetRow';
import NewsSection from './NewsSection';
import Sparkline from './common/Sparkline';
import { CATEGORY_OPTIONS } from '../utils/constants';

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
  const [universe, setUniverse] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [selectedFundamentals, setSelectedFundamentals] = useState({ loading: false, pe: '-', marketCap: '-' });
  const [visibleCount, setVisibleCount] = useState(8);
  const loadMoreRef = useRef(null);
  const isStreamingLoad = state.progress.loaded < state.progress.total;
  const remainingToLoad = Math.max(0, Number(state.progress.total || 0) - Number(state.progress.loaded || 0));

  const filtered = useMemo(() => {
    return state.assets.filter((a) => {
      const okCategory = category === 'all' || a.category === category;
      const q = query.toLowerCase();
      const okText = !q || a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
      return okCategory && okText;
    });
  }, [state.assets, category, query]);

  const normalizedCandidate = String(candidate || '').trim().toUpperCase();
  const watchlistSet = useMemo(
    () => new Set((state.watchlistSymbols || []).map((s) => String(s || '').toUpperCase())),
    [state.watchlistSymbols]
  );
  const selectedUniverseMatch = useMemo(() => {
    const raw = String(candidate || '').trim().toLowerCase();
    if (!raw) return null;
    const bySymbol = universe.find((item) => String(item.symbol || '').toLowerCase() === raw);
    if (bySymbol) return bySymbol;
    const byExactName = universe.find((item) => String(item.name || '').toLowerCase() === raw);
    if (byExactName) return byExactName;
    const bySymbolPrefix = universe.find((item) => String(item.symbol || '').toLowerCase().startsWith(raw));
    if (bySymbolPrefix) return bySymbolPrefix;
    const byNamePrefix = universe.find((item) => String(item.name || '').toLowerCase().startsWith(raw));
    if (byNamePrefix) return byNamePrefix;
    const byNameContains = universe.find((item) => String(item.name || '').toLowerCase().includes(raw));
    return byNameContains || null;
  }, [universe, candidate]);
  const isTickerInput = useMemo(() => /^[A-Z0-9._:-]{1,20}$/.test(normalizedCandidate), [normalizedCandidate]);
  const isAlreadyInWatchlist = useMemo(() => {
    if (selectedUniverseMatch?.symbol) return watchlistSet.has(String(selectedUniverseMatch.symbol).toUpperCase());
    return watchlistSet.has(normalizedCandidate);
  }, [selectedUniverseMatch, watchlistSet, normalizedCandidate]);
  const canAddCandidate = !!normalizedCandidate && !isAlreadyInWatchlist && (!!selectedUniverseMatch || isTickerInput);

  const watchlistAssets = useMemo(() => {
    const bySymbol = Object.fromEntries(state.assets.map((asset) => [String(asset.symbol || '').toUpperCase(), asset]));
    return state.watchlistSymbols
      .map((symbol) => bySymbol[String(symbol || '').toUpperCase()])
      .filter(Boolean)
      .filter((asset) => {
        const okCategory = category === 'all' || asset.category === category;
        const q = query.toLowerCase();
        const okText = !q || asset.symbol.toLowerCase().includes(q) || asset.name.toLowerCase().includes(q);
        return okCategory && okText;
      });
  }, [state.assets, state.watchlistSymbols, category, query]);

  const visibleAssets = useMemo(() => watchlistAssets.slice(0, visibleCount), [watchlistAssets, visibleCount]);
  const showStreamingNote = isStreamingLoad && (visibleAssets.length === 0 || remainingToLoad > 8);
  const hasMore = visibleAssets.length < watchlistAssets.length;
  const selectedAsset = useMemo(() => {
    const symbol = String(selectedSymbol || '').toUpperCase();
    if (!symbol) return null;
    return state.assets.find((item) => String(item.symbol || '').toUpperCase() === symbol) || null;
  }, [state.assets, selectedSymbol]);

  const sessionOpen = Number(selectedAsset?.candles?.o?.[selectedAsset?.candles?.o?.length - 1]);
  const sessionClose = Number(selectedAsset?.candles?.c?.[selectedAsset?.candles?.c?.length - 1]);
  const selectedSeries = selectedAsset?.candles?.c?.slice(-45) || [];
  const trendStart = Number(selectedSeries?.[0]);
  const trendEnd = Number(selectedSeries?.[selectedSeries.length - 1]);
  const trendDeltaPct = Number.isFinite(trendStart) && trendStart !== 0 && Number.isFinite(trendEnd) ? ((trendEnd - trendStart) / trendStart) * 100 : null;

  useEffect(() => {
    setVisibleCount(8);
  }, [category, query, state.watchlistSymbols.length]);

  useEffect(() => {
    let active = true;
    const loadUniverse = async () => {
      try {
        const out = await api.marketUniverse();
        if (!active) return;
        const assets = Array.isArray(out?.assets) ? out.assets : [];
        setUniverse(
          assets.map((item) => ({
            symbol: String(item?.symbol || '').toUpperCase(),
            name: String(item?.name || ''),
            category: String(item?.category || 'equity').toLowerCase() === 'etf' ? 'equity' : String(item?.category || 'equity').toLowerCase(),
            source: String(item?.symbol || '').toUpperCase().endsWith('USDT')
              ? 'finnhub_crypto'
              : String(item?.symbol || '').toUpperCase().includes('_')
                ? 'finnhub_fx'
                : 'finnhub_stock'
          }))
        );
      } catch {
        if (!active) return;
        setUniverse([]);
      }
    };
    loadUniverse();
    return () => {
      active = false;
    };
  }, []);

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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar activo (ej: Apple o AAPL)..." />
        </div>

        <div className="ai-filter-stack" style={{ marginBottom: 8 }}>
          <div className="ai-filter-group">
            <span className="ai-filter-label">Clase de activo</span>
            <div className="ai-filter-row">
              {CATEGORY_OPTIONS.map((x) => (
                <button
                  key={x}
                  type="button"
                  className={`ai-filter-chip ${category === x ? 'is-active is-asset' : ''}`}
                  onClick={() => setCategory(x)}
                >
                  {categoryLabel[x] || x}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="markets-tools">
          <label className="label" style={{ margin: 0, flex: 1 }}>
            <span className="muted">Agregar a watchlist</span>
            <input
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
              placeholder="Escribí activo o ticker (ej: Apple o AAPL)"
              aria-label="Activo para agregar a watchlist"
            />
            {normalizedCandidate ? (
              <span className="muted" style={{ marginTop: 4, display: 'block' }}>
                {selectedUniverseMatch
                  ? isAlreadyInWatchlist
                    ? `${selectedUniverseMatch.symbol} ya está en watchlist.`
                    : `Se agregará: ${selectedUniverseMatch.symbol} - ${selectedUniverseMatch.name}`
                  : isTickerInput
                    ? `Ticker manual: ${normalizedCandidate}`
                    : 'No encontramos ese activo. Probá con nombre más específico o ticker.'}
              </span>
            ) : null}
          </label>
          <button
            type="button"
            className="markets-tools-btn"
            onClick={() => {
              if (!canAddCandidate) return;
              actions.addToWatchlist(
                selectedUniverseMatch || {
                  symbol: normalizedCandidate,
                  name: normalizedCandidate,
                  category: normalizedCandidate.endsWith('USDT') ? 'crypto' : normalizedCandidate.includes('_') ? 'fx' : 'equity',
                  source: normalizedCandidate.endsWith('USDT')
                    ? 'finnhub_crypto'
                    : normalizedCandidate.includes('_')
                      ? 'finnhub_fx'
                      : 'finnhub_stock'
                }
              );
              setCandidate('');
            }}
            disabled={!canAddCandidate}
          >
            Agregar
          </button>
        </div>

        <div className="markets-selected-pick">
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
          <div className="markets-selected-summary">
            <div className="markets-selected-header">
              <div>
                <div className="ind-label">Resumen rápido</div>
                <div className="markets-selected-title mono">
                  {selectedAsset.symbol} <span className="muted">{selectedAsset.name}</span>
                </div>
              </div>
            </div>

            <div className="ind-grid markets-selected-grid">
              <div className="ind-cell trend-panel">
                <div className="ind-label">Evolución (45 velas)</div>
                <div className="trend-chart">
                  <Sparkline values={selectedSeries} color={Number(trendDeltaPct || 0) >= 0 ? '#00E08E' : '#FF4757'} height={56} />
                </div>
                <div className={`trend-meta mono ${Number(trendDeltaPct || 0) >= 0 ? 'up' : 'down'}`}>
                  {trendDeltaPct == null ? '-' : `${trendDeltaPct.toFixed(2)}%`}
                </div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Precio</div>
                <div className="ind-val mono">{formatUSD(selectedAsset.price)}</div>
              </div>

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
                <div className="ind-label">Capitalización</div>
                <div className="ind-val mono">{selectedFundamentals.loading ? '...' : selectedFundamentals.marketCap}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="markets-selected-empty muted">Seleccioná un activo para ver su resumen.</div>
        )}
      </section>

      <section className="card">
        {showStreamingNote && (
          <div className="markets-loading-note">
            Cargando mercado en segundo plano: {state.progress.loaded}/{state.progress.total} (faltan {remainingToLoad})
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
              <button type="button" onClick={() => setVisibleCount((prev) => Math.min(prev + 8, watchlistAssets.length))} aria-label="Cargar más activos">
                Cargar más
              </button>
              <div ref={loadMoreRef} className="markets-load-sentinel" aria-hidden="true" />
            </div>
          ) : null}
          {!watchlistAssets.length && !isStreamingLoad ? <div className="muted">Tu watchlist está vacía para este filtro.</div> : null}
        </div>
      </section>

      <NewsSection
        title={selectedAsset?.symbol ? `Noticias: ${selectedAsset.symbol}` : 'Noticias de mercado'}
        symbol={selectedAsset?.symbol || ''}
        limit={12}
      />
    </div>
  );
};

export default Markets;
