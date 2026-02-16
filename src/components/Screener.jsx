import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { askClaude } from '../api/claude';
import { useApp } from '../store/AppContext';
import { CATEGORY_OPTIONS } from '../utils/constants';

const quick = ['Acciones 10% bajo promedio', 'Cryptos con momentum', 'Mejores dividendos', 'RSI más bajo'];

const localFallback = (assets, query) => {
  const q = query.toLowerCase();
  if (q.includes('rsi')) {
    const rows = assets
      .filter((a) => a.indicators?.rsi)
      .sort((a, b) => a.indicators.rsi - b.indicators.rsi)
      .slice(0, 5)
      .map((a) => `${a.symbol}: RSI ${a.indicators.rsi.toFixed(1)}`);
    return `Top RSI bajo:\n${rows.join('\n')}`;
  }
  if (q.includes('crypto')) {
    const rows = assets.filter((a) => a.category === 'crypto').map((a) => `${a.symbol} ${a.changePercent.toFixed(2)}%`);
    return `Cryptos filtradas:\n${rows.join('\n')}`;
  }
  return 'No encontré un patrón directo en local. Probá una consulta más específica.';
};

const Screener = () => {
  const { state } = useApp();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const lastAutorunRef = useRef('');

  const assets = useMemo(
    () => state.assets.filter((a) => category === 'all' || a.category === category),
    [state.assets, category]
  );
  const isStreamingLoad = state.progress.loaded < state.progress.total;

  const run = async (value) => {
    if (!value.trim()) return;
    setLoading(true);
    const context = assets
      .slice(0, 25)
      .map((a) => `${a.symbol} price=${a.price} change=${a.changePercent}% rsi=${a.indicators?.rsi?.toFixed(2) ?? 'n/a'}`)
      .join('\n');

    try {
      const out = await askClaude(`Consulta: ${value}\n\nAssets:\n${context}`);
      const text = out.fallback ? localFallback(assets, value) : out.text;
      setMessages((prev) => [...prev, { q: value, a: text }]);
    } catch {
      setMessages((prev) => [...prev, { q: value, a: localFallback(assets, value) }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = String(searchParams.get('q') || '').trim();
    const nextCategory = String(searchParams.get('category') || 'all').toLowerCase();
    const autorun = searchParams.get('autorun') === '1';
    const safeCategory = CATEGORY_OPTIONS.includes(nextCategory) ? nextCategory : 'all';

    if (q) setQuery(q);
    setCategory(safeCategory);

    const key = `${safeCategory}:${q}`;
    if (autorun && q && lastAutorunRef.current !== key) {
      lastAutorunRef.current = key;
      run(q);
    }
  }, [searchParams]);

  return (
    <div className="grid screener-page">
      <section className="card screener-hero">
        <div>
          <h2 className="screen-title">Screener IA</h2>
          <p className="muted">Detectá oportunidades por categoría con prompts y contexto del mercado actual.</p>
        </div>
        <div className="row screener-categories">
          {CATEGORY_OPTIONS.map((x) => (
            <button key={x} type="button" className={`pill ${category === x ? 'active' : ''}`} onClick={() => setCategory(x)}>
              {x}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        {isStreamingLoad && (
          <div className="markets-loading-note">
            Sincronizando activos para screener: {state.progress.loaded}/{state.progress.total}
          </div>
        )}
        <div className="screener-quick">
          {quick.map((q) => (
            <button key={q} type="button" className="ai-sug" onClick={() => run(q)}>
              {q}
            </button>
          ))}
        </div>
        <div className="row screener-input">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Escribí tu consulta..." />
          <button type="button" onClick={() => run(query)} disabled={loading}>
            {loading ? 'Analizando...' : 'Enviar'}
          </button>
        </div>
      </section>

      {isStreamingLoad && !messages.length ? (
        <section className="card screener-msg-card">
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line skeleton-line-short" />
        </section>
      ) : null}

      {messages.map((m, idx) => (
        <article key={`${m.q}-${idx}`} className="card screener-msg-card">
          <div className="chat-bubble chat-user">Q: {m.q}</div>
          <pre className="chat-bubble chat-ai screener-answer">{m.a}</pre>
        </article>
      ))}
    </div>
  );
};

export default Screener;
