import React from 'react';

const confidenceLabelFromValue = (value, fallback) => {
  if (fallback) return String(fallback);
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Limited';
  if (n >= 0.75) return 'High';
  if (n >= 0.5) return 'Moderate';
  return 'Limited';
};

const toneClassForRegime = (label) => {
  const value = String(label || '').toLowerCase();
  if (value === 'supportive') return 'regime-pill-positive';
  if (value === 'defensive') return 'regime-pill-negative';
  return 'regime-pill-warning';
};

const toneClassForVolatility = (label) => {
  const value = String(label || '').toLowerCase();
  if (value === 'calm') return 'regime-pill-positive';
  if (value === 'high uncertainty') return 'regime-pill-negative';
  return 'regime-pill-warning';
};

const toneClassForConfidence = (label) => {
  const value = String(label || '').toLowerCase();
  if (value === 'high') return 'regime-pill-positive';
  if (value === 'moderate') return 'regime-pill-warning';
  return 'regime-pill-negative';
};

const RegimeBadge = ({ regimeLabel = 'Mixed', volatilityLabel = 'Calm', confidence, confidenceLabel }) => {
  const confidenceText = confidenceLabelFromValue(confidence, confidenceLabel);

  return (
    <section className="card market-env-card">
      <div className="market-env-title">Market Environment</div>
      <div className="market-env-pills">
        <span className={`regime-pill ${toneClassForRegime(regimeLabel)}`}>{regimeLabel}</span>
        <span className={`regime-pill ${toneClassForVolatility(volatilityLabel)}`}>{volatilityLabel}</span>
        <span className={`regime-pill ${toneClassForConfidence(confidenceText)}`}>{confidenceText}</span>
      </div>
    </section>
  );
};

export default RegimeBadge;
