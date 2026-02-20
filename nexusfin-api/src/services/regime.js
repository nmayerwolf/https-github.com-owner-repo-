const REGIME_ENUM = Object.freeze({
  RISK_ON: 'risk_on',
  RISK_OFF: 'risk_off',
  TRANSITION: 'transition'
});

const VOLATILITY_REGIME_ENUM = Object.freeze({
  NORMAL: 'normal',
  ELEVATED: 'elevated',
  CRISIS: 'crisis'
});

const clamp01 = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
};

const toFinite = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const computeVolatilityRegime = ({ spyVol20dZ = null, spyRet1d = null } = {}) => {
  const safeVolZ = toFinite(spyVol20dZ);
  const safeRet1d = toFinite(spyRet1d);
  if ((safeVolZ != null && safeVolZ >= 2) || (safeRet1d != null && safeRet1d <= -0.03)) return VOLATILITY_REGIME_ENUM.CRISIS;
  if (safeVolZ != null && safeVolZ >= 1) return VOLATILITY_REGIME_ENUM.ELEVATED;
  return VOLATILITY_REGIME_ENUM.NORMAL;
};

const computeRegime = ({ marketSentiment = 'neutral', spyVol20dZ = null, spyRet1d = null, shockEventFlag = false } = {}) => {
  const sentiment = String(marketSentiment || '').toLowerCase();
  const volatilityRegime = computeVolatilityRegime({ spyVol20dZ, spyRet1d });
  const crisisActive = volatilityRegime === VOLATILITY_REGIME_ENUM.CRISIS || (volatilityRegime === VOLATILITY_REGIME_ENUM.ELEVATED && Boolean(shockEventFlag));

  if (volatilityRegime === VOLATILITY_REGIME_ENUM.CRISIS) {
    return {
      regime: REGIME_ENUM.RISK_OFF,
      volatility_regime: volatilityRegime,
      confidence: clamp01(0.85 + (toFinite(spyVol20dZ) != null && toFinite(spyVol20dZ) >= 3 ? 0.1 : 0)),
      crisisActive
    };
  }

  if (sentiment === 'bullish' && volatilityRegime !== VOLATILITY_REGIME_ENUM.ELEVATED) {
    return { regime: REGIME_ENUM.RISK_ON, volatility_regime: volatilityRegime, confidence: 0.7, crisisActive };
  }

  if (sentiment === 'bearish' || volatilityRegime === VOLATILITY_REGIME_ENUM.ELEVATED) {
    return { regime: REGIME_ENUM.RISK_OFF, volatility_regime: volatilityRegime, confidence: 0.68, crisisActive };
  }

  return { regime: REGIME_ENUM.TRANSITION, volatility_regime: volatilityRegime, confidence: 0.55, crisisActive };
};

module.exports = {
  REGIME_ENUM,
  VOLATILITY_REGIME_ENUM,
  computeVolatilityRegime,
  computeRegime
};
