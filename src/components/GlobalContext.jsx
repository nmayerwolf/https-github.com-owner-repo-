import React from 'react';

const IMPACT_META = {
  RED: { icon: '🔴', tone: 'negative' },
  GREEN: { icon: '🟢', tone: 'positive' },
  YELLOW: { icon: '🟡', tone: 'warning' }
};

const CATEGORY_LABELS = {
  en: {
    GEOPOLITICS: 'Geopolitics',
    TARIFFS: 'Tariffs & Trade',
    CENTRAL_BANKS: 'Central Banks',
    EQUITIES: 'Equities',
    AI: 'AI',
    COMMODITIES: 'Commodities',
    METALS: 'Metals',
    MACRO_DATA: 'Macro Data',
    ENERGY: 'Energy',
    CRYPTO: 'Crypto',
    CLIMATE: 'Climate',
    CORPORATE: 'Corporate'
  },
  es: {
    GEOPOLITICS: 'Geopolítica',
    TARIFFS: 'Aranceles',
    CENTRAL_BANKS: 'Bancos centrales',
    EQUITIES: 'Equities',
    AI: 'AI',
    COMMODITIES: 'Commodities',
    METALS: 'Metales',
    MACRO_DATA: 'Macro',
    ENERGY: 'Energía',
    CRYPTO: 'Crypto',
    CLIMATE: 'Clima',
    CORPORATE: 'Corporativo'
  }
};

const highlightTickers = (text = '') => {
  const pattern = /\b([A-Z]{2,5}(?:USDT|USD)?|WTI|XAU|XAG|SPX|NDX|DXY)\b/g;
  const isTicker = (value = '') => /^[A-Z]{2,5}(?:USDT|USD)?$|^(WTI|XAU|XAG|SPX|NDX|DXY)$/.test(String(value || ''));
  return String(text || '').split(pattern).map((chunk, idx) => {
    if (isTicker(chunk)) return <strong key={`${chunk}-${idx}`} className="mono context-ticker">{chunk}</strong>;
    return <React.Fragment key={`${chunk}-${idx}`}>{chunk}</React.Fragment>;
  });
};

const GlobalContext = ({ title, loadingLabel, pendingLabel, items = [], loading = false, error = '', isSpanish = false }) => {
  const lang = isSpanish ? 'es' : 'en';

  return (
    <section className="card">
      <div className="section-header-inline">
        <h3 className="section-title">{title}</h3>
        <span className="badge">{Math.min(items.length, 8)}/8</span>
      </div>
      {loading ? <div className="muted">{loadingLabel}</div> : null}
      {error ? <div className="muted">{error}</div> : null}
      {!loading && !error && !items.length ? <div className="muted">{pendingLabel}</div> : null}
      <div className="grid" style={{ marginTop: 8 }}>
        {items.slice(0, 8).map((item, idx) => {
          const impact = IMPACT_META[String(item.impact || '').toUpperCase()] || IMPACT_META.YELLOW;
          const category = String(item.category || '').toUpperCase();
          const label = CATEGORY_LABELS[lang][category] || category || (isSpanish ? 'Mercado' : 'Market');
          return (
            <article key={`${category}-${idx}`} className="context-item">
              <span className={`context-tag ${impact.tone}`}>{label} {impact.icon}</span>
              <p className="context-text">{highlightTickers(item.text)}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default GlobalContext;
