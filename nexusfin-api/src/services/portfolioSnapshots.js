const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const toDate = (value) => String(value || new Date().toISOString().slice(0, 10));

const pctMap = (totals = {}, total = 0) => {
  const out = {};
  for (const [key, val] of Object.entries(totals)) {
    const num = toNum(val, 0);
    out[key] = total > 0 ? Number(((num / total) * 100).toFixed(2)) : 0;
  }
  return out;
};

const asSymbol = (value) => String(value || '').trim().toUpperCase();

const normalizeLeadership = (leadership = []) =>
  (Array.isArray(leadership) ? leadership : []).map((x) => String(x || '').toLowerCase()).filter(Boolean);

const computeAlignmentScore = ({ holdings = [], totalValue = 0, leadership = [], regime = 'transition', volatilityRegime = 'normal' }) => {
  if (!holdings.length || totalValue <= 0) return 50;

  const leadershipTokens = normalizeLeadership(leadership);
  let leadershipExposure = 0;
  let maxHoldingWeight = 0;
  let equityExposure = 0;

  for (const row of holdings) {
    const value = toNum(row.mark_value);
    if (value <= 0) continue;

    const weight = value / totalValue;
    const sector = String(row.sector || '').toLowerCase();
    const tags = Array.isArray(row.tags) ? row.tags.map((x) => String(x || '').toLowerCase()) : [];
    const category = String(row.category || '').toLowerCase();

    if (weight > maxHoldingWeight) maxHoldingWeight = weight;
    if (['equity', 'etf'].includes(category)) equityExposure += weight;

    const aligned = leadershipTokens.some((token) => token && (sector.includes(token) || tags.some((tag) => tag.includes(token))));
    if (aligned) leadershipExposure += weight;
  }

  let score = 45 + leadershipExposure * 45;

  const concentrationPenalty = Math.max(0, maxHoldingWeight - 0.30) * 120;
  score -= concentrationPenalty;

  if (regime === 'risk_on') {
    score += equityExposure * 10;
  } else if (regime === 'risk_off') {
    score -= equityExposure * 12;
    score += (1 - equityExposure) * 8;
  }

  if (volatilityRegime === 'crisis') score -= 8;
  else if (volatilityRegime === 'elevated') score -= 4;

  return Number(clamp(Math.round(score), 0, 100));
};

const computeConcentration = ({ holdings = [], totalValue = 0 }) => {
  if (!holdings.length || totalValue <= 0) return { topHoldings: [], herfindahl: 0 };

  const sorted = [...holdings]
    .map((row) => ({
      symbol: asSymbol(row.symbol),
      weight: totalValue > 0 ? Number(((toNum(row.mark_value) / totalValue) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.weight - a.weight);

  const herfindahl = Number(
    sorted
      .reduce((acc, row) => acc + Math.pow(row.weight / 100, 2), 0)
      .toFixed(4)
  );

  return {
    topHoldings: sorted.slice(0, 5),
    herfindahl
  };
};

const createPortfolioSnapshotsService = ({ query, logger = console }) => {
  const resolveRunDate = async (requestedDate = null) => {
    if (requestedDate) return toDate(requestedDate);
    const out = await query('SELECT MAX(date)::text AS date FROM market_daily_bars');
    return toDate(out.rows?.[0]?.date || new Date().toISOString().slice(0, 10));
  };

  const loadMarkPrices = async (date) => {
    const out = await query('SELECT symbol, close FROM market_daily_bars WHERE date = $1', [date]);
    const map = new Map();
    for (const row of out.rows || []) {
      map.set(asSymbol(row.symbol), toNum(row.close));
    }
    return map;
  };

  const loadRegime = async (date) => {
    const out = await query(
      'SELECT regime, volatility_regime, leadership FROM regime_state WHERE date = $1 LIMIT 1',
      [date]
    );
    return out.rows?.[0] || { regime: 'transition', volatility_regime: 'normal', leadership: [] };
  };

  const loadSpyBenchmark = async (date) => {
    const out = await query('SELECT ret_1d FROM market_metrics_daily WHERE symbol = $1 AND date = $2 LIMIT 1', ['SPY', date]);
    return toNum(out.rows?.[0]?.ret_1d, 0);
  };

  const loadPortfolios = async () => {
    const out = await query(
      `SELECT id, user_id
       FROM portfolios
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC`
    );
    return out.rows || [];
  };

  const loadPortfolioRows = async (portfolioId) => {
    const out = await query(
      `SELECT p.symbol, p.quantity, p.buy_price, p.category,
              COALESCE(u.sector, p.category) AS sector,
              COALESCE(u.tags, '[]'::jsonb) AS tags
       FROM positions p
       LEFT JOIN universe_symbols u ON u.symbol = p.symbol
       WHERE p.portfolio_id = $1
         AND p.sell_date IS NULL
         AND p.deleted_at IS NULL`,
      [portfolioId]
    );
    return out.rows || [];
  };

  const loadPrevSnapshot = async (portfolioId, date) => {
    const out = await query(
      `SELECT total_value
       FROM portfolio_snapshots
       WHERE portfolio_id = $1 AND date < $2
       ORDER BY date DESC
       LIMIT 1`,
      [portfolioId, date]
    );
    return out.rows?.[0] || null;
  };

  const loadLatestAiNote = async (userId) => {
    const out = await query(
      `SELECT health_summary
       FROM portfolio_advice
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    return out.rows?.[0]?.health_summary || null;
  };

  const persistSnapshot = async ({ portfolioId, date, totalValue, pnlDay, pnlTotal, benchmarkRet, raw }) => {
    await query(
      `INSERT INTO portfolio_snapshots (portfolio_id, date, total_value, pnl_day, pnl_total, benchmark_ret, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (portfolio_id, date)
       DO UPDATE SET
         total_value = EXCLUDED.total_value,
         pnl_day = EXCLUDED.pnl_day,
         pnl_total = EXCLUDED.pnl_total,
         benchmark_ret = EXCLUDED.benchmark_ret,
         raw = EXCLUDED.raw`,
      [portfolioId, date, totalValue, pnlDay, pnlTotal, benchmarkRet, JSON.stringify(raw || {})]
    );
  };

  const persistMetrics = async ({ portfolioId, date, alignmentScore, sectorExposure, concentration, aiNotes, raw }) => {
    await query(
      `INSERT INTO portfolio_metrics (portfolio_id, date, alignment_score, sector_exposure, concentration, ai_notes, raw)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb)
       ON CONFLICT (portfolio_id, date)
       DO UPDATE SET
         alignment_score = EXCLUDED.alignment_score,
         sector_exposure = EXCLUDED.sector_exposure,
         concentration = EXCLUDED.concentration,
         ai_notes = EXCLUDED.ai_notes,
         raw = EXCLUDED.raw`,
      [
        portfolioId,
        date,
        alignmentScore,
        JSON.stringify(sectorExposure || {}),
        JSON.stringify(concentration || {}),
        aiNotes,
        JSON.stringify(raw || {})
      ]
    );
  };

  const runDaily = async ({ date = null } = {}) => {
    const runDate = await resolveRunDate(date);
    const [priceMap, regime, benchmarkRet, portfolios] = await Promise.all([
      loadMarkPrices(runDate),
      loadRegime(runDate),
      loadSpyBenchmark(runDate),
      loadPortfolios()
    ]);

    let generated = 0;

    for (const portfolio of portfolios) {
      try {
        const [rows, prev, aiNote] = await Promise.all([
          loadPortfolioRows(portfolio.id),
          loadPrevSnapshot(portfolio.id, runDate),
          loadLatestAiNote(portfolio.user_id)
        ]);

        const marked = [];
        let totalCost = 0;
        let totalValue = 0;
        const sectorTotals = {};

        for (const row of rows) {
          const symbol = asSymbol(row.symbol);
          const qty = toNum(row.quantity);
          const buyPrice = toNum(row.buy_price);
          if (qty <= 0 || buyPrice <= 0) continue;

          const markPrice = toNum(priceMap.get(symbol), buyPrice);
          const costValue = qty * buyPrice;
          const markValue = qty * markPrice;
          totalCost += costValue;
          totalValue += markValue;

          const sector = String(row.sector || 'other').toLowerCase();
          sectorTotals[sector] = toNum(sectorTotals[sector]) + markValue;

          marked.push({
            symbol,
            category: row.category,
            sector,
            tags: Array.isArray(row.tags) ? row.tags : [],
            quantity: qty,
            buy_price: buyPrice,
            mark_price: markPrice,
            cost_value: Number(costValue.toFixed(4)),
            mark_value: Number(markValue.toFixed(4))
          });
        }

        const prevTotal = toNum(prev?.total_value, totalValue);
        const pnlDay = Number((totalValue - prevTotal).toFixed(4));
        const pnlTotal = Number((totalValue - totalCost).toFixed(4));

        const alignmentScore = computeAlignmentScore({
          holdings: marked,
          totalValue,
          leadership: regime.leadership,
          regime: regime.regime,
          volatilityRegime: regime.volatility_regime
        });
        const sectorExposure = pctMap(sectorTotals, totalValue);
        const concentration = computeConcentration({ holdings: marked, totalValue });

        await persistSnapshot({
          portfolioId: portfolio.id,
          date: runDate,
          totalValue: Number(totalValue.toFixed(4)),
          pnlDay,
          pnlTotal,
          benchmarkRet,
          raw: {
            holdingsCount: marked.length,
            markedWithClose: marked.filter((x) => x.mark_price !== x.buy_price).length,
            totalCost: Number(totalCost.toFixed(4)),
            regime: regime.regime,
            volatilityRegime: regime.volatility_regime
          }
        });

        await persistMetrics({
          portfolioId: portfolio.id,
          date: runDate,
          alignmentScore,
          sectorExposure,
          concentration,
          aiNotes: aiNote,
          raw: {
            leadership: Array.isArray(regime.leadership) ? regime.leadership : [],
            regime: regime.regime,
            volatilityRegime: regime.volatility_regime,
            benchmarkRet
          }
        });

        generated += 1;
      } catch (error) {
        logger.warn?.(`[portfolioSnapshots] failed for ${portfolio.id}`, error?.message || error);
      }
    }

    return {
      generated,
      portfoliosScanned: portfolios.length,
      date: runDate,
      benchmarkRet,
      regime: regime.regime,
      volatilityRegime: regime.volatility_regime
    };
  };

  return {
    runDaily,
    computeAlignmentScore
  };
};

module.exports = { createPortfolioSnapshotsService, computeAlignmentScore };
