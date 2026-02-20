import React from 'react';
import { useTranslation } from '../i18n/useTranslation';

const confidenceLabelFromValue = (value, fallback, t) => {
  if (fallback) return String(fallback);
  const n = Number(value);
  if (!Number.isFinite(n)) return t('news_confidence_limited');
  if (n >= 0.75) return t('news_confidence_high');
  if (n >= 0.5) return t('news_confidence_moderate');
  return t('news_confidence_limited');
};

const toneClassForRegime = (label) => {
  const value = String(label || '').toLowerCase();
  if (value === 'supportive' || value === 'favorable') return 'regime-pill-positive';
  if (value === 'defensive' || value === 'defensivo') return 'regime-pill-negative';
  return 'regime-pill-warning';
};

const toneClassForVolatility = (label) => {
  const value = String(label || '').toLowerCase();
  if (value === 'calm' || value === 'calma') return 'regime-pill-positive';
  if (value === 'high uncertainty' || value === 'alta incertidumbre') return 'regime-pill-negative';
  return 'regime-pill-warning';
};

const toneClassForConfidence = (label) => {
  const value = String(label || '').toLowerCase();
  if (value === 'high' || value === 'alta') return 'regime-pill-positive';
  if (value === 'moderate' || value === 'moderada') return 'regime-pill-warning';
  return 'regime-pill-negative';
};

const normalizeRegimeLabel = (label, t) => {
  const value = String(label || '').toLowerCase();
  if (value === 'supportive' || value === 'favorable') return t('news_regime_risk_on');
  if (value === 'defensive' || value === 'defensivo') return t('news_regime_risk_off');
  return t('news_regime_transition');
};

const normalizeVolLabel = (label, t) => {
  const value = String(label || '').toLowerCase();
  if (value === 'calm' || value === 'calma') return t('news_vol_normal');
  if (value === 'increasing' || value === 'en aumento' || value === 'elevated') return t('news_vol_elevated');
  return t('news_vol_crisis');
};

const normalizeConfidenceLabel = (label, t) => {
  const value = String(label || '').toLowerCase();
  if (value === 'high' || value === 'alta') return t('news_confidence_high');
  if (value === 'moderate' || value === 'moderada') return t('news_confidence_moderate');
  return t('news_confidence_limited');
};

const RegimeBadge = ({ regimeLabel = 'Mixed', volatilityLabel = 'Calm', confidence, confidenceLabel }) => {
  const { t } = useTranslation();
  const regimeText = normalizeRegimeLabel(regimeLabel, t);
  const volatilityText = normalizeVolLabel(volatilityLabel, t);
  const confidenceText = normalizeConfidenceLabel(confidenceLabelFromValue(confidence, confidenceLabel, t), t);

  return (
    <section className="card market-env-card">
      <div className="market-env-title">{t('news_title')}</div>
      <div className="market-env-pills">
        <span className={`regime-pill ${toneClassForRegime(regimeText)}`}>{regimeText}</span>
        <span className={`regime-pill ${toneClassForVolatility(volatilityText)}`}>{volatilityText}</span>
        <span className={`regime-pill ${toneClassForConfidence(confidenceText)}`}>{confidenceText}</span>
      </div>
    </section>
  );
};

export default RegimeBadge;
