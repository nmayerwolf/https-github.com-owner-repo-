const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const round2 = (value) => Math.round(toNum(value, 0) * 100) / 100;

const inferCategory = (symbol = '') => {
  const safe = String(symbol || '').trim().toUpperCase();
  if (!safe) return 'equity';
  if (safe.endsWith('USDT')) return 'crypto';
  if (safe.includes('_')) return 'fx';
  return 'equity';
};

const normalizeSymbol = (value) => String(value || '').trim().toUpperCase();

const calculateSnapshot = (holdings = [], prices = {}, fundamentals = {}) => {
  const details = [];
  let totalValue = 0;
  let totalCost = 0;

  for (const holding of Array.isArray(holdings) ? holdings : []) {
    const symbol = normalizeSymbol(holding?.symbol);
    if (!symbol) continue;

    const priceRow = prices[symbol];
    const currentPrice = toNum(priceRow?.close, NaN);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;

    const qty = toNum(holding?.qty ?? holding?.quantity, 0);
    const avgCost = toNum(holding?.avg_cost ?? holding?.buy_price, 0);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) continue;

    const marketValue = currentPrice * qty;
    const costBasis = avgCost * qty;
    const pnl = marketValue - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    const fund = fundamentals[symbol] || {};

    totalValue += marketValue;
    totalCost += costBasis;

    details.push({
      symbol,
      qty,
      avg_cost: avgCost,
      current_price: round2(currentPrice),
      market_value: round2(marketValue),
      cost_basis: round2(costBasis),
      pnl: round2(pnl),
      pnl_pct: round2(pnlPct),
      weight_pct: 0,
      category: String(holding?.category || '').trim().toLowerCase() || inferCategory(symbol),
      sector: fund?.sector || null
    });
  }

  for (const row of details) {
    row.weight_pct = totalValue > 0 ? round2((toNum(row.market_value) / totalValue) * 100) : 0;
  }

  return {
    total_value: round2(totalValue),
    total_cost: round2(totalCost),
    pnl_absolute: round2(totalValue - totalCost),
    pnl_pct: totalCost > 0 ? round2(((totalValue - totalCost) / totalCost) * 100) : 0,
    holdings_detail: details
  };
};

module.exports = { calculateSnapshot, round2, inferCategory };
