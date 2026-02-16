import React, { useEffect, useState } from 'react';
import { api } from '../api/apiClient';

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

const NewsSection = ({ symbol = '', title = 'Noticias', limit = 6 }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const fetchNews = async () => {
      try {
        const out = symbol ? await api.marketNews({ symbol }) : await api.marketNews({ category: 'general', minId: 0 });
        if (!active) return;
        setItems(Array.isArray(out) ? out.slice(0, limit) : []);
      } catch {
        if (!active) return;
        setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchNews();
    return () => {
      active = false;
    };
  }, [symbol, limit]);

  return (
    <section className="card">
      <div className="section-header-inline">
        <h3 className="section-title">{title}</h3>
      </div>

      {loading ? <div className="muted">Cargando noticias...</div> : null}
      {!loading && !items.length ? <div className="muted">Sin noticias recientes.</div> : null}

      {!loading && !!items.length ? (
        <div className="news-list">
          {items.map((item) => (
            <button
              key={item.id || item.url}
              type="button"
              className="news-item"
              onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
            >
              <img className="news-image" src={item.image || 'https://placehold.co/48x48/151C2C/8899AA?text=N'} alt="" />
              <div className="news-body">
                <div className="news-headline">{item.headline}</div>
                <div className="news-meta mono">
                  {item.source || 'Fuente'} · {timeAgoEs(item.datetime)}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default NewsSection;
