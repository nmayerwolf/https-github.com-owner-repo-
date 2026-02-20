const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const round2 = (value) => Math.round(toNum(value, 0) * 100) / 100;

const calculateAlignmentScore = (snapshot = {}, regimeState = {}, metricsMap = {}) => {
  const holdings = Array.isArray(snapshot?.holdings_detail) ? snapshot.holdings_detail : [];
  if (!holdings.length) return 50;

  let score = 50;
  const equityWeight = holdings.filter((h) => h.category === 'equity').reduce((acc, h) => acc + toNum(h.weight_pct), 0);
  const cryptoWeight = holdings.filter((h) => h.category === 'crypto').reduce((acc, h) => acc + toNum(h.weight_pct), 0);
  const bondWeight = holdings.filter((h) => h.category === 'bond').reduce((acc, h) => acc + toNum(h.weight_pct), 0);

  if (regimeState?.regime === 'risk_on') {
    score += Math.min(15, (equityWeight + cryptoWeight - 50) * 0.3);
    score -= Math.min(10, bondWeight * 0.2);
  } else if (regimeState?.regime === 'risk_off') {
    score += Math.min(15, bondWeight * 0.5);
    score -= Math.min(10, cryptoWeight * 0.3);
  }

  const leadershipSectors = Array.isArray(regimeState?.leadership) ? regimeState.leadership : [];
  const holdingSectors = holdings.map((h) => h.sector).filter(Boolean);
  const leadershipOverlap = holdingSectors.filter((sector) =>
    leadershipSectors.some((lead) => String(lead).toLowerCase() === String(sector).toLowerCase())
  ).length;
  const leadershipRatio = holdingSectors.length > 0 ? leadershipOverlap / holdingSectors.length : 0;
  score += leadershipRatio * 15;

  let trendAligned = 0;
  for (const holding of holdings) {
    const metrics = metricsMap[String(holding?.symbol || '').toUpperCase()];
    if (metrics && toNum(holding.current_price) > toNum(metrics.sma_50, 0)) trendAligned += 1;
  }
  const trendRatio = holdings.length > 0 ? trendAligned / holdings.length : 0;
  score += (trendRatio - 0.5) * 30;

  return Math.max(0, Math.min(100, Math.round(score)));
};

const calculateBenchmarkComparison = (portfolioSnapshots = [], benchmarkBars = []) => {
  if ((portfolioSnapshots || []).length < 2 || (benchmarkBars || []).length < 2) {
    return { portfolio_pnl_pct: 0, benchmark_pnl_pct: 0, alpha: 0 };
  }

  const oldest = portfolioSnapshots[portfolioSnapshots.length - 1];
  const newest = portfolioSnapshots[0];
  const portfolioPnl = toNum(oldest?.total_value) > 0 ? ((toNum(newest?.total_value) - toNum(oldest?.total_value)) / toNum(oldest?.total_value)) * 100 : 0;

  const oldestBench = benchmarkBars[benchmarkBars.length - 1];
  const newestBench = benchmarkBars[0];
  const benchmarkPnl = toNum(oldestBench?.close) > 0 ? ((toNum(newestBench?.close) - toNum(oldestBench?.close)) / toNum(oldestBench?.close)) * 100 : 0;

  return {
    portfolio_pnl_pct: round2(portfolioPnl),
    benchmark_pnl_pct: round2(benchmarkPnl),
    alpha: round2(portfolioPnl - benchmarkPnl)
  };
};

const calculateExposure = (holdingsDetail = []) => {
  const byCategory = {};
  const bySector = {};

  for (const holding of Array.isArray(holdingsDetail) ? holdingsDetail : []) {
    const category = String(holding?.category || 'other').toLowerCase();
    byCategory[category] = toNum(byCategory[category], 0) + toNum(holding?.weight_pct, 0);

    const sector = String(holding?.sector || 'Other');
    bySector[sector] = toNum(bySector[sector], 0) + toNum(holding?.weight_pct, 0);
  }

  for (const key of Object.keys(byCategory)) byCategory[key] = round2(byCategory[key]);
  for (const key of Object.keys(bySector)) bySector[key] = round2(bySector[key]);

  return {
    category_exposure: byCategory,
    sector_exposure: bySector
  };
};

const calculateConcentration = (holdingsDetail = []) => {
  const sorted = [...(Array.isArray(holdingsDetail) ? holdingsDetail : [])].sort((a, b) => toNum(b.weight_pct) - toNum(a.weight_pct));
  const top3 = sorted.slice(0, 3).reduce((sum, row) => sum + toNum(row.weight_pct), 0);
  return round2(top3);
};

const calculateVolatility20d = (portfolioSnapshots = []) => {
  const points = Array.isArray(portfolioSnapshots) ? portfolioSnapshots : [];
  if (points.length < 21) return 0;

  const ordered = [...points].slice(0, 21).reverse();
  const returns = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = toNum(ordered[i - 1].total_value, 0);
    const curr = toNum(ordered[i].total_value, 0);
    if (!prev || !curr) continue;
    returns.push((curr - prev) / prev);
  }
  if (!returns.length) return 0;

  const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
  const variance = returns.reduce((sum, val) => sum + (val - mean) ** 2, 0) / returns.length;
  return round2(Math.sqrt(variance) * Math.sqrt(252) * 100);
};

module.exports = {
  calculateAlignmentScore,
  calculateBenchmarkComparison,
  calculateExposure,
  calculateConcentration,
  calculateVolatility20d,
  round2
};
