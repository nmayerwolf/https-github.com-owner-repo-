import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { useLanguage } from '../store/LanguageContext';

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const Portfolio = () => {
  const { state, actions } = useApp();
  const { isSpanish } = useLanguage();
  const [ideas, setIdeas] = useState([]);
  const [newHolding, setNewHolding] = useState({ symbol: '', name: '', quantity: '', buyPrice: '' });
  const [saving, setSaving] = useState(false);

  const t = isSpanish
    ? {
        title: 'Portfolio',
        cta: 'Subí tu portfolio para personalizar ideas',
        add: 'Agregar holding',
        holdings: 'Holdings',
        overlaps: 'Exposición vs Ideas activas',
        concentration: 'Concentración',
        noOverlap: 'No encontramos overlaps claros entre holdings e ideas activas.',
        conservative: 'Ajustes sugeridos (conservadores)'
      }
    : {
        title: 'Portfolio',
        cta: 'Upload your portfolio to personalize ideas',
        add: 'Add holding',
        holdings: 'Holdings',
        overlaps: 'Exposure vs Active Ideas',
        concentration: 'Concentration',
        noOverlap: 'No clear overlaps found between holdings and active ideas.',
        conservative: 'Suggested adjustments (conservative)'
      };

  const defaultPortfolioId = state.portfolios?.[0]?.id || '';
  const activePortfolioId = state.activePortfolioId || defaultPortfolioId;

  const holdings = useMemo(() => {
    const prices = Object.fromEntries((state.assets || []).map((asset) => [String(asset.symbol || '').toUpperCase(), toNum(asset.price, 0)]));
    return (state.positions || [])
      .filter((position) => !position.sellDate && (position.portfolioId || defaultPortfolioId) === activePortfolioId)
      .map((position) => {
        const symbol = String(position.symbol || '').toUpperCase();
        const quantity = toNum(position.quantity, 0);
        const avgCost = toNum(position.buyPrice, 0);
        const mark = prices[symbol] > 0 ? prices[symbol] : avgCost;
        const marketValue = quantity * mark;
        return {
          symbol,
          name: position.name,
          quantity,
          avgCost,
          marketValue
        };
      })
      .sort((a, b) => b.marketValue - a.marketValue);
  }, [state.positions, state.assets, activePortfolioId, defaultPortfolioId]);

  const totalValue = useMemo(() => holdings.reduce((acc, item) => acc + item.marketValue, 0), [holdings]);

  const top3Concentration = useMemo(() => {
    if (!holdings.length || totalValue <= 0) return 0;
    const top = holdings.slice(0, 3).reduce((acc, item) => acc + item.marketValue, 0);
    return (top / totalValue) * 100;
  }, [holdings, totalValue]);

  const overlaps = useMemo(() => {
    if (!holdings.length || !ideas.length) return [];
    return ideas
      .map((idea) => {
        const text = `${idea.title || ''} ${idea.thesis || ''} ${idea.fundamentals || ''}`.toUpperCase();
        const matches = holdings.filter((h) => text.includes(h.symbol));
        if (!matches.length) return null;
        return { idea, matches };
      })
      .filter(Boolean);
  }, [ideas, holdings]);

  useEffect(() => {
    let active = true;
    const loadIdeas = async () => {
      try {
        const out = await api.getIdeas('ACTIVE');
        if (!active) return;
        setIdeas(Array.isArray(out?.ideas) ? out.ideas : []);
      } catch {
        if (!active) return;
        setIdeas([]);
      }
    };
    loadIdeas();
    return () => {
      active = false;
    };
  }, []);

  const saveHolding = async () => {
    if (!actions?.addPosition || !activePortfolioId) return;
    const payload = {
      symbol: String(newHolding.symbol || '').trim().toUpperCase(),
      name: String(newHolding.name || '').trim(),
      category: 'equity',
      buyDate: new Date().toISOString().slice(0, 10),
      buyPrice: toNum(newHolding.buyPrice, 0),
      quantity: toNum(newHolding.quantity, 0),
      portfolioId: activePortfolioId,
      notes: null
    };
    if (!payload.symbol || !payload.name || payload.buyPrice <= 0 || payload.quantity <= 0) return;
    setSaving(true);
    try {
      await actions.addPosition(payload);
      setNewHolding({ symbol: '', name: '', quantity: '', buyPrice: '' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid ideas-page">
      <section className="card ideas-header-card">
        <h2 className="screen-title">{t.title}</h2>
      </section>

      {!holdings.length ? (
        <section className="card">
          <strong>{t.cta}</strong>
          <div className="grid" style={{ marginTop: 8, gap: 8 }}>
            <input className="input" placeholder="Symbol" value={newHolding.symbol} onChange={(e) => setNewHolding((prev) => ({ ...prev, symbol: e.target.value }))} />
            <input className="input" placeholder="Name" value={newHolding.name} onChange={(e) => setNewHolding((prev) => ({ ...prev, name: e.target.value }))} />
            <input className="input" placeholder="Quantity" type="number" min="0" step="any" value={newHolding.quantity} onChange={(e) => setNewHolding((prev) => ({ ...prev, quantity: e.target.value }))} />
            <input className="input" placeholder="Avg cost" type="number" min="0" step="any" value={newHolding.buyPrice} onChange={(e) => setNewHolding((prev) => ({ ...prev, buyPrice: e.target.value }))} />
            <div className="row">
              <button type="button" onClick={saveHolding} disabled={saving}>{saving ? '...' : t.add}</button>
            </div>
          </div>
        </section>
      ) : null}

      {holdings.length ? (
        <>
          <section className="card">
            <h3 className="section-title">{t.holdings}</h3>
            <div className="grid" style={{ marginTop: 8, gap: 6 }}>
              {holdings.map((h) => (
                <div key={h.symbol} className="row">
                  <span>{h.symbol} · {h.name}</span>
                  <strong>{h.quantity} @ {h.avgCost.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h3 className="section-title">{t.concentration}</h3>
            <div className="muted">Top 3 holdings: <strong>{top3Concentration.toFixed(1)}%</strong></div>
          </section>

          <section className="card">
            <h3 className="section-title">{t.overlaps}</h3>
            {!overlaps.length ? <div className="muted">{t.noOverlap}</div> : null}
            <div className="grid" style={{ marginTop: 8 }}>
              {overlaps.map((row) => (
                <article key={row.idea.id} className="ideas-card opportunistic">
                  <strong>{row.idea.title}</strong>
                  <div className="muted" style={{ marginTop: 4 }}>{row.matches.map((m) => m.symbol).join(', ')}</div>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <h3 className="section-title">{t.conservative}</h3>
            <ul className="ideas-list" style={{ marginTop: 8 }}>
              {top3Concentration > 65 ? <li>We suggest gradual de-concentration in the top 3 positions instead of forced rebalance.</li> : null}
              {top3Concentration <= 65 ? <li>We suggest keeping current structure and adjusting only on strong conviction updates.</li> : null}
              <li>We suggest incremental sizing changes and explicit stop conditions for new adds.</li>
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
};

export default Portfolio;
