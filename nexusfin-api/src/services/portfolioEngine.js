const { randomUUID } = require('crypto');

const ART_TZ = 'America/Argentina/Buenos_Aires';
const artDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ART_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const safeQuery = async (query, sql, params = [], fallback = { rows: [] }) => {
  try {
    return await query(sql, params);
  } catch {
    return fallback;
  }
};

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const createPortfolioEngine = ({ query, logger = console }) => {
  const resolvePortfolio = async (userId) => {
    const out = await safeQuery(
      query,
      `SELECT portfolio_id, user_id, name, base_currency
       FROM user_portfolios
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [userId]
    );
    return out.rows?.[0] || null;
  };

  const getSnapshot = async ({ userId, date } = {}) => {
    const runDate = date || artDate();
    const portfolio = await resolvePortfolio(userId);
    if (!portfolio) {
      return {
        portfolioId: null,
        date: runDate,
        empty: true,
        cta: 'Upload your portfolio to personalize ideas',
        positions: [],
        exposures: [],
        recommendations: []
      };
    }

    const positionsOut = await safeQuery(
      query,
      `SELECT a.ticker, p.quantity, p.market_value, p.weight
       FROM user_portfolio_positions p
       JOIN assets a ON a.asset_id = p.asset_id
       WHERE p.portfolio_id = $1 AND p.as_of_date = $2
       ORDER BY p.weight DESC NULLS LAST`,
      [portfolio.portfolio_id, runDate]
    );

    const exposuresOut = await safeQuery(
      query,
      `SELECT theme_id, direct_exposure, indirect_exposure, total_exposure
       FROM user_portfolio_exposures
       WHERE portfolio_id = $1 AND as_of_date = $2
       ORDER BY total_exposure DESC`,
      [portfolio.portfolio_id, runDate]
    );

    const positions = (positionsOut.rows || []).map((row) => ({
      ticker: row.ticker,
      quantity: toNum(row.quantity, 0),
      marketValue: toNum(row.market_value, 0),
      weight: toNum(row.weight, 0)
    }));

    const exposures = (exposuresOut.rows || []).map((row) => ({
      themeId: row.theme_id,
      directExposure: toNum(row.direct_exposure, 0),
      indirectExposure: toNum(row.indirect_exposure, 0),
      totalExposure: toNum(row.total_exposure, 0)
    }));

    const topThreeWeight = positions.slice(0, 3).reduce((acc, row) => acc + toNum(row.weight, 0), 0);
    const recommendations = topThreeWeight > 0.55
      ? [{ type: 'CONSERVATIVE_ADJUSTMENT', narrative: 'Vemos concentración elevada en top 3 posiciones; sugerimos diversificación gradual.' }]
      : [{ type: 'HOLD', narrative: 'Estructura de concentración razonable para el perfil actual.' }];

    return {
      portfolioId: portfolio.portfolio_id,
      date: runDate,
      positions,
      exposures,
      recommendations
    };
  };

  const getChallenges = async ({ userId, date } = {}) => {
    const runDate = date || artDate();
    const portfolio = await resolvePortfolio(userId);
    if (!portfolio) return [];

    const out = await safeQuery(
      query,
      `SELECT challenge_id, date::text AS date, challenge_type, severity, narrative, numbers_json
       FROM portfolio_challenges
       WHERE portfolio_id = $1 AND date = $2
       ORDER BY created_at DESC`,
      [portfolio.portfolio_id, runDate]
    );

    return (out.rows || []).map((row) => ({
      challengeId: row.challenge_id,
      date: row.date,
      type: row.challenge_type,
      severity: row.severity,
      narrative: row.narrative,
      numbers: Array.isArray(row.numbers_json) ? row.numbers_json : []
    }));
  };

  const upsertHoldings = async ({ userId, holdings = [], asOfDate } = {}) => {
    const runDate = asOfDate || artDate();
    let portfolio = await resolvePortfolio(userId);

    if (!portfolio) {
      const created = await safeQuery(
        query,
        `INSERT INTO user_portfolios (portfolio_id, user_id, name, base_currency, created_at)
         VALUES ($1,$2,'Main','USD',NOW())
         RETURNING portfolio_id, user_id, name, base_currency`,
        [randomUUID(), userId]
      );
      portfolio = created.rows?.[0] || null;
      if (!portfolio) return { updated: 0, asOfDate: runDate };
    }

    let updated = 0;
    for (const item of holdings) {
      const assetId = String(item.assetId || '').trim();
      if (!assetId) continue;
      await safeQuery(
        query,
        `INSERT INTO user_portfolio_positions (portfolio_id, as_of_date, asset_id, quantity, market_value, weight, source)
         VALUES ($1,$2,$3,$4,$5,$6,'manual')
         ON CONFLICT (portfolio_id, as_of_date, asset_id)
         DO UPDATE SET quantity = EXCLUDED.quantity,
                       market_value = EXCLUDED.market_value,
                       weight = EXCLUDED.weight,
                       source = EXCLUDED.source`,
        [
          portfolio.portfolio_id,
          runDate,
          assetId,
          item.quantity != null ? Number(item.quantity) : null,
          item.marketValue != null ? Number(item.marketValue) : null,
          item.weight != null ? Number(item.weight) : null
        ]
      );
      updated += 1;
    }

    return { updated, asOfDate: runDate, portfolioId: portfolio.portfolio_id };
  };

  return { getSnapshot, getChallenges, upsertHoldings, artDate };
};

module.exports = { createPortfolioEngine };
