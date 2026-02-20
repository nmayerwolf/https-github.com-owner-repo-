import React, { useState } from 'react';

const CrisisBanner = ({ crisis }) => {
  const isActive = Boolean(crisis?.isActive || crisis?.is_active);
  const [open, setOpen] = useState(false);

  if (!isActive) return null;

  const title = crisis?.title || 'High Uncertainty Mode Active';
  const summary = crisis?.summary || 'Elevated volatility and broad market stress detected.';
  const whatChanged = Array.isArray(crisis?.learnMore?.whatChanged) ? crisis.learnMore.whatChanged : [];
  const fallbackItems = [
    'Fewer speculative ideas generated',
    'Risk alerts prioritized',
    'Conservative thresholds applied'
  ];
  const detailItems = whatChanged.length ? whatChanged : fallbackItems;

  return (
    <section className="card crisis-banner" aria-live="polite">
      <div className="crisis-title">⚠️ {title}</div>
      <div className="muted">{summary}</div>
      <button type="button" className="inline-link-btn crisis-learn-more" onClick={() => setOpen((prev) => !prev)}>
        Learn more {open ? '▴' : '▾'}
      </button>
      {open ? (
        <ul className="crisis-list">
          {detailItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

export default CrisisBanner;
