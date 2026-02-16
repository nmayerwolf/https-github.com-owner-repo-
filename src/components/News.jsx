import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';

const MAX_ITEMS = 60;
const WATCHLIST_SYMBOL_LIMIT = 8;
const REFRESH_MS = 45000;
const AI_RELEVANCE_MIN = 6;

const reasonLabel = (reason) => {
  const raw = String(reason || '').trim();
  if (!raw) return '';
  if (raw.startsWith('watchlist:')) return `Watchlist (${raw.replace('watchlist:', '')})`;
  if (raw.startsWith('high:')) return `Impacto alto: ${raw.replace('high:', '')}`;
  if (raw.startsWith('medium:')) return `Impacto medio: ${raw.replace('medium:', '')}`;
  if (raw.startsWith('fresh:1h')) return 'Última hora';
  if (raw.startsWith('fresh:4h')) return 'Últimas 4h';
  return raw;
};

const timeAgoEs = (unixSeconds) => {
  const ts = Number(unixSeconds || 0) * 1000;
  if (!Number.isFinite(ts) || ts <= 0) return 'hace un rato';
  const diffMs = Date.now() - ts;
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
};

const dedupeNews = (items = []) => {
  const map = new Map();
  for (const item of items) {
    const key = item?.id || item?.url;
    if (!key) continue;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
};

const News = () => {
  const { state } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('ai');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(15);

  const watchlistSymbols = state.watchlistSymbols || [];
  const assetBySymbol = useMemo(
    () => Object.fromEntries((state.assets || []).map((a) => [String(a.symbol || '').toUpperCase(), a])),
    [state.assets]
  );
  const filteredItems = useMemo(() => {
    const modeItems = mode === 'ai' ? items.filter((item) => Number(item?.aiScore || 0) >= AI_RELEVANCE_MIN) : items;
    const q = String(query || '').trim().toLowerCase();
    if (!q) return modeItems;
    return modeItems.filter((item) => {
      const haystack = [item?.headline, item?.summary, item?.source, item?.related].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [items, mode, query]);

  useEffect(() => {
    let active = true;
    let timer = null;

    const fetchAllNews = async () => {
      try {
        setError('');
        if (!items.length) setLoading(true);

        const symbols = watchlistSymbols.slice(0, WATCHLIST_SYMBOL_LIMIT);
        if (mode === 'ai') {
          const out = await api.marketNewsRecommended({ symbols, category: 'general', minId: 0, minScore: AI_RELEVANCE_MIN, limit: MAX_ITEMS });
          if (!active) return;
          setItems(Array.isArray(out?.items) ? out.items : []);
          return;
        }

        const requests = [api.marketNews({ category: 'general', minId: 0 }), ...symbols.map((symbol) => api.marketNews({ symbol }))];
        const responses = await Promise.all(requests.map((p) => p.catch(() => [])));
        if (!active) return;

        const merged = dedupeNews(responses.flat().filter(Boolean));
        const ranked = merged
          .map((item) => ({ ...item, aiScore: Number(item?.aiScore || 0) }))
          .sort((a, b) => {
            return Number(b.datetime || 0) - Number(a.datetime || 0);
          })
          .slice(0, MAX_ITEMS);

        setItems(ranked);
      } catch {
        if (!active) return;
        setError('No se pudieron cargar noticias relevantes.');
      } finally {
        if (active) setLoading(false);
        if (active) {
          timer = setTimeout(fetchAllNews, REFRESH_MS);
        }
      }
    };

    fetchAllNews();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [mode, watchlistSymbols.join(',')]);

  useEffect(() => {
    setVisibleCount(15);
  }, [query, mode]);

  return (
    <div className="grid">
      <section className="card">
        <div className="section-header-inline">
          <h2 className="screen-title">Noticias</h2>
        </div>
        <div className="muted">Feed en tiempo real con impacto potencial en mercados globales y activos de tu watchlist.</div>
        <div className="alerts-toolbar" style={{ marginTop: 10 }}>
          <button type="button" onClick={() => setMode('ai')} style={{ borderColor: mode === 'ai' ? '#60A5FA' : undefined }}>
            Recomendadas por IA
          </button>
          <button type="button" onClick={() => setMode('all')} style={{ borderColor: mode === 'all' ? '#60A5FA' : undefined }}>
            Todas
          </button>
        </div>
        <div className="search-bar" style={{ marginTop: 10 }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por palabra clave (ej: inflación, OPEP, Apple, earnings...)"
          />
        </div>
      </section>

      {loading ? <section className="card muted">Cargando noticias relevantes...</section> : null}
      {error ? <section className="card" style={{ borderColor: '#FF4757AA' }}>{error}</section> : null}
      {!loading && !filteredItems.length && !error ? <section className="card muted">Sin noticias para este filtro.</section> : null}

      {!loading && !!filteredItems.length ? (
        <section className="card">
          <div className="news-list">
            {filteredItems.slice(0, visibleCount).map((item) => {
              const relatedSymbols = String(item.related || '')
                .split(',')
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
              const matched = relatedSymbols.filter((s) => watchlistSymbols.includes(s)).slice(0, 3);
              const leadSymbol = relatedSymbols.find((s) => assetBySymbol[s]) || null;
              const leadName = leadSymbol ? assetBySymbol[leadSymbol]?.name : null;

              return (
                <button
                  key={item.id || item.url}
                  type="button"
                  className="news-item"
                  onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                >
                  <img className="news-image" src={item.image || 'https://placehold.co/72x72/151C2C/8899AA?text=N'} alt="" />
                  <div className="news-body">
                    <div className="news-headline">{item.headline}</div>
                    {item.summary ? <div className="muted" style={{ marginTop: 4 }}>{String(item.summary).slice(0, 220)}...</div> : null}
                    <div className="news-meta mono">
                      {item.source || 'Fuente'} · {timeAgoEs(item.datetime)} · relevancia {Number(item.aiScore || 0)}
                    </div>
                    {mode === 'ai' && Array.isArray(item.aiReasons) && item.aiReasons.length ? (
                      <div className="row" style={{ marginTop: 6, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                        {item.aiReasons.slice(0, 3).map((reason) => (
                          <span key={`${item.id || item.url}-reason-${reason}`} className="badge" style={{ background: '#8CC8FF22', color: '#8CC8FF' }}>
                            IA: {reasonLabel(reason)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="row" style={{ marginTop: 6, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                      {leadSymbol ? <span className="badge" style={{ background: '#60A5FA22', color: '#60A5FA' }}>{leadSymbol}{leadName ? ` · ${leadName}` : ''}</span> : null}
                      {matched.map((symbol) => (
                        <span key={`${item.id || item.url}-${symbol}`} className="badge" style={{ background: '#00E08E22', color: '#00E08E' }}>
                          Watchlist: {symbol}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {visibleCount < filteredItems.length ? (
            <div className="news-load-more">
              <button type="button" className="inline-link-btn" onClick={() => setVisibleCount((prev) => Math.min(prev + 15, filteredItems.length))}>
                Ver más noticias
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

export default News;
