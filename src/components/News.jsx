import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';

const MAX_ITEMS = 60;
const WATCHLIST_SYMBOL_LIMIT = 8;
const REFRESH_MS = 45000;
const IMPACT_HIGH_KEYWORDS = [
  'earnings', 'guidance', 'merger', 'acquisition', 'ipo', 'rate', 'inflation', 'fed', 'ecb',
  'tariff', 'sanction', 'war', 'ceasefire', 'election', 'opec', 'default', 'stimulus',
  'regulation', 'antitrust', 'launch', 'funding', 'round', 'geopolitical', 'bankrupt',
  'recession', 'gdp', 'treasury'
];
const IMPACT_MEDIUM_KEYWORDS = [
  'forecast', 'outlook', 'policy', 'tax', 'strike', 'supply', 'demand', 'upgrade',
  'downgrade', 'contract', 'deal'
];

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

const computeImpactScore = (item = {}, watchlistSymbols = []) => {
  const text = `${String(item?.headline || '').toLowerCase()} ${String(item?.summary || '').toLowerCase()}`;
  const related = String(item?.related || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const watchlist = new Set((watchlistSymbols || []).map((s) => String(s || '').toUpperCase()));
  const matchedWatchlist = related.filter((s) => watchlist.has(s));

  let score = Number(item?.aiScore || 0);
  for (const keyword of IMPACT_HIGH_KEYWORDS) {
    if (text.includes(keyword)) score += 3;
  }
  for (const keyword of IMPACT_MEDIUM_KEYWORDS) {
    if (text.includes(keyword)) score += 1;
  }
  if (matchedWatchlist.length) score += matchedWatchlist.length * 4;
  if (related.length >= 2) score += 2;

  const ts = Number(item?.datetime || 0);
  if (Number.isFinite(ts) && ts > 0) {
    const ageMinutes = Math.max(1, Math.floor((Date.now() - ts * 1000) / 60000));
    if (ageMinutes <= 60) score += 3;
    else if (ageMinutes <= 240) score += 1;
  }

  return Math.max(0, score);
};

const impactLabel = (score) => {
  if (Number(score) >= 12) return 'Muy relevante';
  if (Number(score) >= 7) return 'Relevante';
  return 'Poco relevante';
};

const impactStyle = (score) => {
  if (Number(score) >= 12) return { background: '#FF7A9B22', color: '#FF7A9B' };
  if (Number(score) >= 7) return { background: '#8CC8FF22', color: '#8CC8FF' };
  return { background: '#8FA3BF22', color: '#A7B5C8' };
};

const News = () => {
  const { state } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(15);

  const watchlistSymbols = state.watchlistSymbols || [];
  const assetBySymbol = useMemo(
    () => Object.fromEntries((state.assets || []).map((a) => [String(a.symbol || '').toUpperCase(), a])),
    [state.assets]
  );
  const filteredItems = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [item?.headline, item?.summary, item?.source, item?.related].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

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
          .map((item) => {
            const score = computeImpactScore(item, watchlistSymbols);
            return { ...item, impactScore: score, impactLabel: impactLabel(score) };
          })
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
        <div className="muted">Todas las noticias de mercado, ordenadas de más reciente a más antigua.</div>
        <div className="search-bar" style={{ marginTop: 10 }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar noticia (ej: inflación, OPEP, Apple, earnings...)"
          />
        </div>
      </section>

      {loading ? <section className="card muted">Cargando noticias...</section> : null}
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
                      {item.source || 'Fuente'} · {timeAgoEs(item.datetime)} · score {Number(item.impactScore || 0)}
                    </div>
                    <div className="row" style={{ marginTop: 6, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                      <span className="badge" style={impactStyle(item.impactScore)}>
                        {item.impactLabel || 'Poco relevante'}
                      </span>
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
