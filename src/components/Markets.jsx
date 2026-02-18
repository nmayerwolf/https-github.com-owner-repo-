import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import AssetRow from './common/AssetRow';
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

const normalizeSearchText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const Markets = () => {
  const { state, actions } = useApp();
  const [category, setCategory] = useState('all');
  const [watchlistQuery, setWatchlistQuery] = useState('');
  const [candidate, setCandidate] = useState('');
  const [universe, setUniverse] = useState([]);
  const [remoteUniverse, setRemoteUniverse] = useState([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [resettingWatchlist, setResettingWatchlist] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const loadMoreRef = useRef(null);
  const isStreamingLoad = state.progress.loaded < state.progress.total;
  const remainingToLoad = Math.max(0, Number(state.progress.total || 0) - Number(state.progress.loaded || 0));

  const normalizedCandidate = String(candidate || '').trim().toUpperCase();
  const searchableUniverse = useMemo(() => universe || [], [universe]);
  const localCandidateMatches = useMemo(() => {
    const raw = normalizeSearchText(candidate);
    if (!raw) return [];
    return searchableUniverse
      .filter((item) => {
        const symbol = normalizeSearchText(item.symbol);
        const name = normalizeSearchText(item.name);
        return symbol.includes(raw) || name.includes(raw);
      })
      .sort((a, b) => {
        const aSymbol = normalizeSearchText(a.symbol);
        const bSymbol = normalizeSearchText(b.symbol);
        const aName = normalizeSearchText(a.name);
        const bName = normalizeSearchText(b.name);
        const aScore = aSymbol === raw ? 0 : aName === raw ? 1 : aSymbol.startsWith(raw) ? 2 : aName.startsWith(raw) ? 3 : 4;
        const bScore = bSymbol === raw ? 0 : bName === raw ? 1 : bSymbol.startsWith(raw) ? 2 : bName.startsWith(raw) ? 3 : 4;
        if (aScore !== bScore) return aScore - bScore;
        return aSymbol.localeCompare(bSymbol);
      })
      .slice(0, 8);
  }, [searchableUniverse, candidate]);

  const candidateSuggestions = useMemo(() => {
    const map = new Map();
    [...localCandidateMatches, ...(remoteUniverse || [])].forEach((item) => {
      const symbol = String(item?.symbol || '').toUpperCase();
      if (!symbol || map.has(symbol)) return;
      map.set(symbol, {
        symbol,
        name: String(item?.name || ''),
        category: String(item?.category || 'equity'),
        source: String(item?.source || (symbol.endsWith('USDT') ? 'finnhub_crypto' : symbol.includes('_') ? 'finnhub_fx' : 'finnhub_stock'))
      });
    });
    return [...map.values()].slice(0, 8);
  }, [localCandidateMatches, remoteUniverse]);

  const watchlistSet = useMemo(
    () => new Set((state.watchlistSymbols || []).map((s) => String(s || '').toUpperCase())),
    [state.watchlistSymbols]
  );
  const selectedUniverseMatch = useMemo(() => {
    const raw = normalizeSearchText(candidate);
    if (!raw) return null;
    const bySymbol = candidateSuggestions.find((item) => normalizeSearchText(item.symbol) === raw);
    if (bySymbol) return bySymbol;
    const byExactName = candidateSuggestions.find((item) => normalizeSearchText(item.name) === raw);
    if (byExactName) return byExactName;
    const bySymbolPrefix = candidateSuggestions.find((item) => normalizeSearchText(item.symbol).startsWith(raw));
    if (bySymbolPrefix) return bySymbolPrefix;
    const byNamePrefix = candidateSuggestions.find((item) => normalizeSearchText(item.name).startsWith(raw));
    if (byNamePrefix) return byNamePrefix;
    const byNameContains = candidateSuggestions.find((item) => normalizeSearchText(item.name).includes(raw));
    return byNameContains || null;
  }, [candidateSuggestions, candidate]);
  const isAlreadyInWatchlist = useMemo(() => {
    if (selectedUniverseMatch?.symbol) return watchlistSet.has(String(selectedUniverseMatch.symbol).toUpperCase());
    return watchlistSet.has(normalizedCandidate);
  }, [selectedUniverseMatch, watchlistSet, normalizedCandidate]);
  const canAddCandidate = !!normalizedCandidate && !isAlreadyInWatchlist && !!selectedUniverseMatch;

  const watchlistAssets = useMemo(() => {
    const q = normalizeSearchText(watchlistQuery);
    const bySymbol = Object.fromEntries(state.assets.map((asset) => [String(asset.symbol || '').toUpperCase(), asset]));
    return state.watchlistSymbols
      .map((symbol) => bySymbol[String(symbol || '').toUpperCase()])
      .filter(Boolean)
      .filter((asset) => category === 'all' || asset.category === category)
      .filter((asset) => {
        if (!q) return true;
        return normalizeSearchText(asset.symbol).includes(q) || normalizeSearchText(asset.name).includes(q);
      });
  }, [state.assets, state.watchlistSymbols, category, watchlistQuery]);
  const visibleWatchlistSet = useMemo(
    () => new Set(watchlistAssets.map((asset) => String(asset?.symbol || '').toUpperCase())),
    [watchlistAssets]
  );
  const selectedSymbolUpper = String(selectedUniverseMatch?.symbol || '').toUpperCase();
  const selectedAlreadyButHidden =
    Boolean(selectedSymbolUpper) && watchlistSet.has(selectedSymbolUpper) && !visibleWatchlistSet.has(selectedSymbolUpper);

  const visibleAssets = useMemo(() => watchlistAssets.slice(0, visibleCount), [watchlistAssets, visibleCount]);
  const showStreamingNote = isStreamingLoad && (visibleAssets.length === 0 || remainingToLoad > 8);
  const hasMore = visibleAssets.length < watchlistAssets.length;

  useEffect(() => {
    setVisibleCount(8);
  }, [category, watchlistQuery, state.watchlistSymbols.length]);

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
    const raw = String(candidate || '').trim();
    if (raw.length < 2) {
      setRemoteUniverse([]);
      setCandidateLoading(false);
      return undefined;
    }

    let active = true;
    setCandidateLoading(true);
    const timer = setTimeout(async () => {
      try {
        const out = await api.marketSearch(raw);
        if (!active) return;
        const items = Array.isArray(out?.items) ? out.items : [];
        setRemoteUniverse(
          items.map((item) => ({
            symbol: String(item?.symbol || '').toUpperCase(),
            name: String(item?.name || ''),
            category: String(item?.category || 'equity').toLowerCase(),
            source: String(item?.source || (String(item?.symbol || '').toUpperCase().includes('_') ? 'finnhub_fx' : 'finnhub_stock'))
          }))
        );
      } catch {
        if (!active) return;
        setRemoteUniverse([]);
      } finally {
        if (active) setCandidateLoading(false);
      }
    }, 260);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [candidate]);

  useEffect(() => {
    if (!hasMore) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const node = loadMoreRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => Math.min(prev + 8, watchlistAssets.length));
        }
      },
      { rootMargin: '120px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, watchlistAssets.length]);

  return (
    <div className="grid markets-page">
      <section className="card">
        <h2 className="screen-title">Mercados</h2>

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
                    ? selectedAlreadyButHidden
                      ? `${selectedUniverseMatch.symbol} ya está en watchlist (ahora no se ve por los filtros/búsqueda actuales).`
                      : `${selectedUniverseMatch.symbol} ya está en watchlist.`
                    : `Se agregará: ${selectedUniverseMatch.symbol} - ${selectedUniverseMatch.name}`
                  : candidateLoading
                    ? 'Buscando activos...'
                    : 'No encontramos ese activo. Probá con nombre o ticker.'}
              </span>
            ) : null}
            {candidateSuggestions.length ? (
              <div className="markets-watchlist-suggestions">
                {candidateSuggestions.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    className={`markets-watchlist-suggestion ${selectedUniverseMatch?.symbol === item.symbol ? 'is-active' : ''}`}
                    onClick={() => setCandidate(item.symbol)}
                  >
                    <span className="mono">{item.symbol}</span>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <button
            type="button"
            className="markets-tools-btn"
            onClick={() => {
              if (!canAddCandidate) return;
              actions.addToWatchlist(selectedUniverseMatch);
              setCandidate('');
            }}
            disabled={!canAddCandidate}
          >
            Agregar
          </button>
        </div>
      </section>

      <section className="card">
        <div className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Watchlist</h3>
          <button
            type="button"
            onClick={async () => {
              if (resettingWatchlist) return;
              const ok = window.confirm('¿Querés reestablecer la watchlist al listado por defecto?');
              if (!ok) return;
              setResettingWatchlist(true);
              try {
                await actions.resetWatchlist();
              } finally {
                setResettingWatchlist(false);
              }
            }}
            disabled={resettingWatchlist}
            style={{ fontSize: '0.85rem', padding: '6px 10px' }}
          >
            {resettingWatchlist ? 'Reestableciendo...' : 'Reestablecer watchlist'}
          </button>
        </div>
        <div className="search-bar">
          <input value={watchlistQuery} onChange={(e) => setWatchlistQuery(e.target.value)} placeholder="Buscar en watchlist (activo o ticker)..." />
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
        {showStreamingNote && (
          <div className="markets-loading-note">
            Cargando mercado en segundo plano: {state.progress.loaded}/{state.progress.total} (faltan {remainingToLoad})
          </div>
        )}
        <div className="asset-list">
          {isStreamingLoad && !watchlistAssets.length
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
          {!watchlistAssets.length && !isStreamingLoad ? <div className="muted">Tu watchlist no tiene activos para este filtro/búsqueda.</div> : null}
        </div>
      </section>
    </div>
  );
};

export default Markets;
