import { useMemo, useState } from 'react';
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
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const assets = useMemo(
    () => state.assets.filter((a) => category === 'all' || a.category === category),
    [state.assets, category]
  );

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

  return (
    <div className="grid">
      <section className="card">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {CATEGORY_OPTIONS.map((x) => (
            <button key={x} type="button" onClick={() => setCategory(x)} style={{ borderColor: category === x ? '#00E08E' : undefined }}>
              {x}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => run(q)}>
              {q}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Escribí tu consulta..." />
          <button type="button" onClick={() => run(query)} disabled={loading}>
            {loading ? 'Analizando...' : 'Enviar'}
          </button>
        </div>
      </section>

      {messages.map((m, idx) => (
        <article key={`${m.q}-${idx}`} className="card">
          <strong>Q: {m.q}</strong>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'IBM Plex Mono, monospace', color: '#E0E7F0' }}>{m.a}</pre>
        </article>
      ))}
    </div>
  );
};

export default Screener;
