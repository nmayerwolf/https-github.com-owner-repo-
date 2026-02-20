const regimeLabel = (regime) =>
  (
    {
      risk_on: 'Supportive',
      risk_off: 'Defensive',
      transition: 'Mixed'
    }[String(regime || '').toLowerCase()] || 'Mixed'
  );

const volatilityLabel = (volatility) =>
  (
    {
      normal: 'Calm',
      elevated: 'Increasing',
      crisis: 'High Uncertainty'
    }[String(volatility || '').toLowerCase()] || 'Unknown'
  );

const confidenceLabel = (confidence) => {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return 'Limited';
  if (value >= 0.75) return 'High';
  if (value >= 0.5) return 'Moderate';
  return 'Limited';
};

module.exports = { regimeLabel, volatilityLabel, confidenceLabel };
