const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const REGION_BY_SYMBOL = {
  BABA: 'APAC',
  '^MERV': 'LATAM',
  MELI: 'LATAM',
  PBR: 'LATAM',
  VALE: 'LATAM',
  EEM: 'EM'
};

export const inferRegimeContext = (assets = []) => {
  const rows = (assets || []).filter((asset) => Number.isFinite(Number(asset?.changePercent)));
  const advancers = rows.filter((asset) => Number(asset.changePercent) > 0).length;
  const breadth = rows.length ? (advancers / rows.length) * 100 : 50;
  const avgAbs = rows.length ? rows.reduce((acc, asset) => acc + Math.abs(Number(asset.changePercent || 0)), 0) / rows.length : 0;
  const avg = rows.length ? rows.reduce((acc, asset) => acc + Number(asset.changePercent || 0), 0) / rows.length : 0;
  const regime = breadth >= 56 && avg > 0.2 ? 'Risk On' : breadth <= 44 && avg < -0.2 ? 'Risk Off' : 'Mixed';
  const volatility = avgAbs > 2.2 ? 'High' : avgAbs > 1.2 ? 'Elevated' : 'Contained';
  return { regime, volatility, breadth, avg, avgAbs };
};

export const inferRegion = ({ symbol = '', category = '' } = {}) => {
  const normalizedSymbol = String(symbol || '').toUpperCase();
  const normalizedCategory = String(category || '').toLowerCase();
  if (normalizedCategory === 'fx' || normalizedCategory === 'crypto' || normalizedSymbol.includes('_') || normalizedSymbol.endsWith('USDT')) {
    return 'GLOBAL';
  }
  if (REGION_BY_SYMBOL[normalizedSymbol]) return REGION_BY_SYMBOL[normalizedSymbol];
  return 'US';
};

export const computeExposureByClass = (positions = []) => {
  const total = (positions || []).reduce((acc, position) => acc + toNum(position.marketValue, 0), 0);
  const grouped = (positions || []).reduce((acc, position) => {
    const key = String(position?.category || 'equity').toLowerCase();
    acc[key] = (acc[key] || 0) + toNum(position.marketValue, 0);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      pct: total > 0 ? (value / total) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);
};

export const computeExposureByTicker = (positions = []) => {
  const total = (positions || []).reduce((acc, position) => acc + toNum(position.marketValue, 0), 0);
  const grouped = (positions || []).reduce((acc, position) => {
    const key = String(position?.symbol || 'UNKNOWN').toUpperCase();
    acc[key] = (acc[key] || 0) + toNum(position.marketValue, 0);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([ticker, value]) => ({
      ticker,
      value,
      pct: total > 0 ? (value / total) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);
};

export const computeExposureByRegion = (positions = []) => {
  const total = (positions || []).reduce((acc, position) => acc + toNum(position.marketValue, 0), 0);
  const grouped = (positions || []).reduce((acc, position) => {
    const region = inferRegion(position);
    acc[region] = (acc[region] || 0) + toNum(position.marketValue, 0);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([region, value]) => ({
      region,
      value,
      pct: total > 0 ? (value / total) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);
};

export const computeLimitRows = ({ exposureRows = [], baseLimits = {}, keyField = 'assetClass', top = 5, factor = 1 } = {}) => {
  const rows = Object.entries(baseLimits || {}).map(([key, base]) => {
    const adjusted = Math.max(8, Math.round(toNum(base, 0) * factor));
    const current = toNum(exposureRows.find((row) => String(row[keyField]) === String(key))?.pct, 0);
    return { [keyField]: key, current, base: toNum(base, 0), adjusted };
  });

  const breaches = rows.filter((row) => row.current > row.adjusted).sort((a, b) => b.current - a.current).slice(0, top);
  return { rows: rows.slice(0, top), breaches };
};

export const computeDynamicLimits = ({
  exposureByClass = [],
  exposureByTicker = [],
  exposureByRegion = [],
  baseLimits = {},
  tickerBaseLimit = 18,
  regionBaseLimits = {},
  volatility = 'Contained',
  crisisActive = false
} = {}) => {
  const factor = crisisActive ? 0.78 : volatility === 'Elevated' ? 0.88 : 1;
  const classLimits = computeLimitRows({
    exposureRows: exposureByClass,
    baseLimits,
    keyField: 'assetClass',
    top: 6,
    factor
  });
  const tickerLimits = {
    rows: (exposureByTicker || [])
      .slice(0, 5)
      .map((row) => ({ ...row, base: tickerBaseLimit, adjusted: Math.max(6, Math.round(toNum(tickerBaseLimit, 0) * factor)) })),
    breaches: (exposureByTicker || [])
      .slice(0, 5)
      .map((row) => ({ ...row, base: tickerBaseLimit, adjusted: Math.max(6, Math.round(toNum(tickerBaseLimit, 0) * factor)) }))
      .filter((row) => row.pct > row.adjusted)
  };
  const regionLimits = computeLimitRows({
    exposureRows: exposureByRegion,
    baseLimits: regionBaseLimits,
    keyField: 'region',
    top: 5,
    factor
  });

  const explanations = classLimits.rows
    .filter((row) => row.adjusted !== row.base)
    .slice(0, 4)
    .map((row) => `${row.assetClass.toUpperCase()} max exposure ${row.base}% -> ${row.adjusted}% due to ${crisisActive ? 'crisis mode' : 'rising volatility regime'}.`);
  if (tickerLimits.breaches.length) {
    const overloaded = tickerLimits.breaches[0];
    explanations.push(`Ticker concentration risk: ${overloaded.ticker} at ${overloaded.pct.toFixed(1)}% exceeds ${overloaded.adjusted}% max.`);
  }
  if (regionLimits.breaches.length) {
    const overloaded = regionLimits.breaches[0];
    explanations.push(`Regional concentration risk: ${overloaded.region} at ${overloaded.current.toFixed(1)}% exceeds ${overloaded.adjusted}% max.`);
  }

  return { classLimits, tickerLimits, regionLimits, explanations: explanations.slice(0, 6) };
};
