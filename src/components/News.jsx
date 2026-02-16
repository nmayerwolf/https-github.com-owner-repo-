import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';

const MAX_ITEMS = 60;
const WATCHLIST_SYMBOL_LIMIT = 6;
const REFRESH_MS = 45000;
const AI_RELEVANCE_MIN = 6;

const KEYWORDS_HIGH = [
  'earnings',
  'guidance',
  'merger',
  'acquisition',
  'ipo',
  'rate',
  'inflation',
  'fed',
  'ecb',
  'tariff',
  'sanction',
  'war',
  'ceasefire',
  'election',
  'opec',
  'debt',
  'default',
  'stimulus',
  'regulation',
  'antitrust',
  'launch',
  'funding',
  'round',
  'geopolitical',
  'bankrupt',
  'layoff',
  'recession',
  'gdp',
  'export',
  'import',
  'treasury'
];

const KEYWORDS_MED = ['forecast', 'outlook', 'policy', 'tax', 'strike', 'supply', 'demand', 'upgrade', 'downgrade', 'contract', 'deal'];

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

const scoreNews = (item, watchlistSymbols = []) => {
  const headline = String(item?.headline || '').toLowerCase();
  const summary = String(item?.summary || '').toLowerCase();
  const text = `${headline} ${summary}`;
  let score = 0;

  for (const kw of KEYWORDS_HIGH) {
    if (text.includes(kw)) score += 4;
  }
  for (const kw of KEYWORDS_MED) {
    if (text.includes(kw)) score += 2;
  }

  const related = String(item?.related || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const watch = new Set(watchlistSymbols.map((s) => String(s || '').toUpperCase()));
  const relatedHits = related.filter((s) => watch.has(s)).length;
  score += relatedHits * 5;

  if (Number(item?.datetime) > 0) {
    const ageMinutes = Math.max(1, Math.floor((Date.now() - Number(item.datetime) * 1000) / 60000));
    if (ageMinutes <= 60) score += 4;
    else if (ageMinutes <= 240) score += 2;
  }

  return score;
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
    const modeItems = mode === 'ai' ? items.filter((item) => Number(item?._score || 0) >= AI_RELEVANCE_MIN) : items;
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
        const requests = [api.marketNews({ category: 'general', minId: 0 }), ...symbols.map((symbol) => api.marketNews({ symbol }))];
        const responses = await Promise.all(requests.map((p) => p.catch(() => [])));
        if (!active) return;

        const merged = dedupeNews(responses.flat().filter(Boolean));
        const ranked = merged
          .map((item) => ({ ...item, _score: scoreNews(item, watchlistSymbols) }))
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
  }, [watchlistSymbols.join(',')]);

  useEffect(() => {
    setVisibleCount(15);
  }, [query]);

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
                      {item.source || 'Fuente'} · {timeAgoEs(item.datetime)} · relevancia {item._score}
                    </div>
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
