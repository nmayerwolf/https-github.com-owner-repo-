const detectRegime = (data = {}) => {
  const { spy = {}, vix = null, breadth = 0, sectorPerf = [] } = data;

  let volatility_regime = 'normal';
  if (Number(vix) > 30 || Number(spy.volatility_20d) > 0.25) volatility_regime = 'crisis';
  else if (Number(vix) > 20 || Number(spy.volatility_20d) > 0.18) volatility_regime = 'elevated';

  let regime = 'transition';
  let confidence = 0.5;

  const spyAbove50 = Number(spy.close) > Number(spy.sma_50);
  const spyAbove200 = Number(spy.close) > Number(spy.sma_200);
  const broadAdvancing = Number(breadth) > 0.6;

  if (spyAbove50 && spyAbove200 && broadAdvancing && volatility_regime === 'normal') {
    regime = 'risk_on';
    confidence = 0.75 + (Number(breadth) - 0.6) * 0.5;
  } else if (!spyAbove50 && !spyAbove200 && Number(breadth) < 0.4) {
    regime = 'risk_off';
    confidence = 0.7 + (0.4 - Number(breadth)) * 0.5;
  }

  confidence = Math.min(1, Math.max(0, confidence));

  const leadership = (Array.isArray(sectorPerf) ? [...sectorPerf] : [])
    .sort((a, b) => Number(b?.perf20d || 0) - Number(a?.perf20d || 0))
    .slice(0, 3)
    .map((item) => String(item?.category || '').toLowerCase())
    .filter(Boolean);

  const risk_flags = [];
  if (Number(spy.rsi_14) > 70) risk_flags.push('SPY overbought (RSI > 70)');
  if (Number(spy.rsi_14) < 30) risk_flags.push('SPY oversold (RSI < 30)');
  if (!spyAbove200) risk_flags.push('SPY below 200-day SMA');
  if (Number(breadth) < 0.3) risk_flags.push('Narrow market breadth (<30%)');
  if (volatility_regime !== 'normal') risk_flags.push(`Volatility ${volatility_regime}`);

  return {
    regime,
    volatility_regime,
    leadership,
    macro_drivers: [],
    risk_flags,
    confidence
  };
};

module.exports = { detectRegime };
