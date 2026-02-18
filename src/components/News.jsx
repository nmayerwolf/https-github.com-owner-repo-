import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { recordRecommendedClick, recordRecommendedImpressions } from '../store/newsAnalyticsStore';

const MAX_RECOMMENDED = 40;
const MAX_ALL = 120;
const WATCHLIST_SYMBOL_LIMIT = 8;
const REFRESH_MS = 45000;
const WINDOW_HOURS = 48;
const NEWS_PREFS_KEY = 'horsai_news_ui_prefs_v1';

const loadNewsPrefs = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { recommendedQuery: '', allQuery: '' };
    const raw = window.localStorage.getItem(NEWS_PREFS_KEY);
    if (!raw) return { recommendedQuery: '', allQuery: '' };
    const parsed = JSON.parse(raw);
    return {
      recommendedQuery: String(parsed?.recommendedQuery || ''),
      allQuery: String(parsed?.allQuery || '')
    };
  } catch {
    return { recommendedQuery: '', allQuery: '' };
  }
};

const saveNewsPrefs = (prefs = {}) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      NEWS_PREFS_KEY,
      JSON.stringify({
        recommendedQuery: String(prefs.recommendedQuery || ''),
        allQuery: String(prefs.allQuery || '')
      })
    );
  } catch {
    // noop
  }
};

const toUnixSeconds = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const parsed = Date.parse(String(value || ''));
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed / 1000);
  return 0;
};

const timeAgoEs = (unixSeconds) => {
  const ts = toUnixSeconds(unixSeconds) * 1000;
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
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }
  return [...map.values()];
};

const withinHours = (unixSeconds, hours) => {
  const ts = toUnixSeconds(unixSeconds);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const maxAgeSec = Number(hours) * 3600;
  const ageSec = Math.floor(Date.now() / 1000) - ts;
  return ageSec >= 0 && ageSec <= maxAgeSec;
};

const impactLabel = (score) => {
  if (Number(score) >= 16) return 'Muy relevante';
  if (Number(score) >= 10) return 'Relevante';
  return 'Poco relevante';
};

const impactStyle = (score) => {
  if (Number(score) >= 16) return { background: '#FF7A9B22', color: '#FF7A9B' };
  if (Number(score) >= 10) return { background: '#8CC8FF22', color: '#8CC8FF' };
  return { background: '#8FA3BF22', color: '#A7B5C8' };
};

const themeLabel = (theme) => {
  const key = String(theme || '').toLowerCase();
  if (key === 'macro') return 'Macro';
  if (key === 'geopolitics') return 'Geopolítica';
  if (key === 'commodities') return 'Commodities';
  if (key === 'fx') return 'FX';
  if (key === 'crypto') return 'Crypto';
  if (key === 'equity') return 'Equity';
  return 'Global';
};

const themeStyle = (theme) => {
  const key = String(theme || '').toLowerCase();
  if (key === 'macro') return { background: '#FBBF2422', color: '#FBBF24' };
  if (key === 'geopolitics') return { background: '#FB718522', color: '#FB7185' };
  if (key === 'commodities') return { background: '#22D3EE22', color: '#22D3EE' };
  if (key === 'fx') return { background: '#A78BFA22', color: '#A78BFA' };
  if (key === 'crypto') return { background: '#00E08E22', color: '#00E08E' };
  if (key === 'equity') return { background: '#60A5FA22', color: '#60A5FA' };
  return { background: '#8FA3BF22', color: '#A7B5C8' };
};

const normalizeRecommended = (item = {}) => ({
  ...item,
  impactScore: Number(item?.aiScore || 0),
  impactLabel: impactLabel(item?.aiScore || 0)
});

const News = () => {
  const { state } = useApp();
  const initialPrefs = loadNewsPrefs();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recommendedItems, setRecommendedItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [recommendedQuery, setRecommendedQuery] = useState(initialPrefs.recommendedQuery);
  const [allQuery, setAllQuery] = useState(initialPrefs.allQuery);
  const [visibleRecommended, setVisibleRecommended] = useState(12);
  const [visibleAll, setVisibleAll] = useState(15);

  const watchlistSymbols = state.watchlistSymbols || [];

  const filteredRecommended = useMemo(() => {
    const q = String(recommendedQuery || '').trim().toLowerCase();
    return recommendedItems.filter((item) => {
      if (!q) return true;
      const haystack = [item?.headline, item?.summary, item?.source, item?.related, ...(item?.aiReasons || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [recommendedItems, recommendedQuery]);

  const filteredAll = useMemo(() => {
    const q = String(allQuery || '').trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) => {
      const haystack = [item?.headline, item?.summary, item?.source, item?.related].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [allItems, allQuery]);

  useEffect(() => {
    let active = true;
    let timer = null;

    const fetchNews = async () => {
      try {
        setError('');
        if (!recommendedItems.length && !allItems.length) setLoading(true);

        const symbols = watchlistSymbols.slice(0, WATCHLIST_SYMBOL_LIMIT);

        const [recommendedRes, allGeneralRes] = await Promise.all([
          api.marketNewsRecommended({
            symbols,
            category: 'general',
            minScore: 10,
            limit: MAX_RECOMMENDED,
            maxAgeHours: WINDOW_HOURS,
            strictImpact: true
          }),
          api.marketNews({ category: 'general', minId: 0 })
        ]);
        if (!active) return;

        const recommended = Array.isArray(recommendedRes?.items) ? recommendedRes.items : [];
        const normalizedRecommended = recommended
          .filter((item) => withinHours(item?.datetime, WINDOW_HOURS))
          .map(normalizeRecommended)
          .sort((a, b) => toUnixSeconds(b?.datetime) - toUnixSeconds(a?.datetime))
          .slice(0, MAX_RECOMMENDED);

        const allMerged = dedupeNews(Array.isArray(allGeneralRes) ? allGeneralRes : [])
          .filter((item) => withinHours(item?.datetime, WINDOW_HOURS))
          .sort((a, b) => toUnixSeconds(b?.datetime) - toUnixSeconds(a?.datetime))
          .slice(0, MAX_ALL);

        setRecommendedItems(normalizedRecommended);
        setAllItems(allMerged);
        recordRecommendedImpressions(normalizedRecommended);
        api
          .trackNewsTelemetry({
            eventType: 'impression',
            items: normalizedRecommended.map((item) => ({
              id: item.id || item.url,
              aiTheme: item.aiTheme || 'global',
              aiScore: Number(item.impactScore || item.aiScore || 0),
              headline: item.headline || ''
            }))
          })
          .catch(() => {});
      } catch {
        if (!active) return;
        setError('No se pudieron cargar noticias.');
      } finally {
        if (active) setLoading(false);
        if (active) timer = setTimeout(fetchNews, REFRESH_MS);
      }
    };

    fetchNews();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [watchlistSymbols.join(',')]);

  useEffect(() => {
    setVisibleRecommended(12);
  }, [recommendedQuery]);

  useEffect(() => {
    setVisibleAll(15);
  }, [allQuery]);

  useEffect(() => {
    saveNewsPrefs({ recommendedQuery, allQuery });
  }, [recommendedQuery, allQuery]);

  return (
    <div className="grid">
      <section className="card">
        <div className="section-header-inline">
          <h2 className="screen-title">Noticias</h2>
        </div>
        <div className="muted">Cobertura global para mercados, filtrada en ventana de últimas {WINDOW_HOURS}h.</div>
      </section>

      {loading ? <section className="card muted">Cargando noticias...</section> : null}
      {error ? <section className="card" style={{ borderColor: '#FF4757AA' }}>{error}</section> : null}

      {!loading ? (
        <section className="card">
          <div className="section-header-inline">
            <h3 className="section-title">Recomendadas por IA</h3>
          </div>
          <div className="muted">Solo noticias de alto impacto potencial para mercados globales (curadas por IA).</div>
          <div className="search-bar" style={{ marginTop: 10 }}>
            <input
              value={recommendedQuery}
              onChange={(event) => setRecommendedQuery(event.target.value)}
              placeholder="Buscar en recomendadas (ej: inflación, Fed, petróleo, guerra...)"
            />
          </div>

          <div className="news-list" style={{ marginTop: 8 }}>
            {!filteredRecommended.length ? <div className="card muted">Sin noticias recomendadas para este filtro.</div> : null}
            {filteredRecommended.slice(0, visibleRecommended).map((item) => (
              <button
                key={item.id || item.url}
                type="button"
                className="news-item"
                onClick={() => {
                  recordRecommendedClick(item);
                  api
                    .trackNewsTelemetry({
                      eventType: 'click',
                      items: [
                        {
                          id: item.id || item.url,
                          aiTheme: item.aiTheme || 'global',
                          aiScore: Number(item.impactScore || item.aiScore || 0),
                          headline: item.headline || ''
                        }
                      ]
                    })
                    .catch(() => {});
                  window.open(item.url, '_blank', 'noopener,noreferrer');
                }}
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
                      {item.impactLabel}
                    </span>
                    <span className="badge" style={themeStyle(item.aiTheme)}>
                      {themeLabel(item.aiTheme)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {visibleRecommended < filteredRecommended.length ? (
            <div className="news-load-more">
              <button
                type="button"
                className="inline-link-btn"
                onClick={() => setVisibleRecommended((prev) => Math.min(prev + 12, filteredRecommended.length))}
              >
                Ver más recomendadas
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading ? (
        <section className="card">
          <div className="section-header-inline">
            <h3 className="section-title">Todas las noticias</h3>
          </div>
          <div className="muted">Feed completo de noticias de mercado global en últimas {WINDOW_HOURS}h.</div>
          <div className="search-bar" style={{ marginTop: 10 }}>
            <input
              value={allQuery}
              onChange={(event) => setAllQuery(event.target.value)}
              placeholder="Buscar en todas (ej: Apple, China, tasas, OPEP...)"
            />
          </div>

          <div className="news-list" style={{ marginTop: 8 }}>
            {!filteredAll.length ? <div className="card muted">Sin noticias para este filtro.</div> : null}
            {filteredAll.slice(0, visibleAll).map((item) => (
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
                    {item.source || 'Fuente'} · {timeAgoEs(item.datetime)}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {visibleAll < filteredAll.length ? (
            <div className="news-load-more">
              <button type="button" className="inline-link-btn" onClick={() => setVisibleAll((prev) => Math.min(prev + 15, filteredAll.length))}>
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
