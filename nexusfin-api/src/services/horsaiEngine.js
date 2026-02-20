const { cooldownDaysForAction } = require('./horsaiPolicy');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toDate = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
};

const createHorsaiEngine = ({ query }) => {
  const upsertPortfolioScoreDaily = async ({
    userId,
    portfolioId,
    date = toDate(),
    marketAlignment = 50,
    personalConsistency = 50,
    scoreTotal = null
  }) => {
    const total =
      scoreTotal == null
        ? Number(((toNum(marketAlignment, 50) + toNum(personalConsistency, 50)) / 2).toFixed(2))
        : toNum(scoreTotal, 50);

    await query(
      `INSERT INTO horsai_portfolio_scores_daily (user_id, portfolio_id, date, market_alignment, personal_consistency, score_total)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, portfolio_id, date)
       DO UPDATE SET
         market_alignment = EXCLUDED.market_alignment,
         personal_consistency = EXCLUDED.personal_consistency,
         score_total = EXCLUDED.score_total,
         updated_at = NOW()`,
      [userId, portfolioId, date, marketAlignment, personalConsistency, total]
    );

    return {
      userId,
      portfolioId,
      date,
      marketAlignment: toNum(marketAlignment, 50),
      personalConsistency: toNum(personalConsistency, 50),
      scoreTotal: toNum(total, 50)
    };
  };

  const createSignal = async ({
    userId,
    portfolioId,
    score,
    suggestionLevel,
    confidence,
    regime,
    volatilityRegime,
    diagnosis,
    riskImpact,
    adjustment = {},
    specificAssets = [],
    consecutiveDisplayDays = 1,
    reactivatedAt = null
  }) => {
    const out = await query(
      `INSERT INTO horsai_signals
       (user_id, portfolio_id, score, suggestion_level, confidence, regime, volatility_regime, diagnosis, risk_impact, adjustment, specific_assets, consecutive_display_days, reactivated_at)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13)
       RETURNING *`,
      [
        userId,
        portfolioId,
        score,
        suggestionLevel,
        confidence,
        regime,
        volatilityRegime,
        diagnosis,
        riskImpact,
        JSON.stringify(adjustment || {}),
        JSON.stringify(Array.isArray(specificAssets) ? specificAssets : []),
        Math.max(1, toNum(consecutiveDisplayDays, 1)),
        reactivatedAt
      ]
    );

    return out.rows[0] || null;
  };

  const applySignalAction = async ({ signalId, userId, action }) => {
    const normalized = String(action || '').toLowerCase();
    if (!['acknowledge', 'dismiss'].includes(normalized)) {
      const error = new Error('acción inválida');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const currentOut = await query(
      `SELECT id, user_action, dismiss_streak
       FROM horsai_signals
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [signalId, userId]
    );

    const current = currentOut.rows?.[0];
    if (!current) return null;

    const nextDismissStreak = normalized === 'dismiss' ? toNum(current.dismiss_streak, 0) + 1 : 0;
    const cooldownDays = cooldownDaysForAction({ action: normalized, dismissStreak: nextDismissStreak });
    const nextAction = normalized === 'dismiss' ? 'dismissed' : 'acknowledged';

    const updatedOut = await query(
      `UPDATE horsai_signals
       SET user_action = $3,
           dismiss_streak = $4,
           cooldown_until = (CURRENT_DATE + ($5::int * INTERVAL '1 day'))::date,
           last_action_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, portfolio_id, user_action, dismiss_streak, cooldown_until, updated_at`,
      [signalId, userId, nextAction, nextDismissStreak, cooldownDays]
    );

    return updatedOut.rows[0] || null;
  };

  const recordSignalOutcome = async ({
    signalId,
    userId,
    portfolioId,
    evaluatedAt = toDate(),
    evalWindowDays = 7,
    deltaReturn = 0,
    deltaVolatility = 0,
    deltaDrawdown = 0,
    rai = 0
  }) => {
    const out = await query(
      `INSERT INTO horsai_signal_outcomes
       (signal_id, user_id, portfolio_id, evaluated_at, eval_window_days, delta_return, delta_volatility, delta_drawdown, rai)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (signal_id, evaluated_at)
       DO UPDATE SET
         eval_window_days = EXCLUDED.eval_window_days,
         delta_return = EXCLUDED.delta_return,
         delta_volatility = EXCLUDED.delta_volatility,
         delta_drawdown = EXCLUDED.delta_drawdown,
         rai = EXCLUDED.rai
       RETURNING *`,
      [signalId, userId, portfolioId, evaluatedAt, evalWindowDays, deltaReturn, deltaVolatility, deltaDrawdown, rai]
    );

    return out.rows[0] || null;
  };

  const refreshConvictionPolicy = async ({ userId }) => {
    const meanOut = await query(
      `SELECT COALESCE(AVG(rai), 0) AS rai_mean_20
       FROM (
         SELECT rai
         FROM horsai_signal_outcomes
         WHERE user_id = $1
         ORDER BY evaluated_at DESC
         LIMIT 20
       ) t`,
      [userId]
    );

    const raiMean20 = toNum(meanOut.rows?.[0]?.rai_mean_20, 0);

    const prevOut = await query(
      `SELECT confidence_threshold
       FROM horsai_user_conviction_policy
       WHERE user_id = $1`,
      [userId]
    );

    const previousThreshold = toNum(prevOut.rows?.[0]?.confidence_threshold, 0.75);
    const nextThreshold = raiMean20 < 0 ? clamp(previousThreshold + 0.03, 0.75, 0.95) : previousThreshold;

    const upsertOut = await query(
      `INSERT INTO horsai_user_conviction_policy (user_id, rai_mean_20, confidence_threshold, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         rai_mean_20 = EXCLUDED.rai_mean_20,
         confidence_threshold = EXCLUDED.confidence_threshold,
         updated_at = NOW()
       RETURNING user_id, rai_mean_20, confidence_threshold, updated_at`,
      [userId, raiMean20, nextThreshold]
    );

    return upsertOut.rows?.[0] || null;
  };

  const getSignalReview = async ({ userId, portfolioId, days = 90 }) => {
    const boundedDays = clamp(toNum(days, 90), 7, 90);

    const out = await query(
      `SELECT
         COUNT(*)::int AS total_signals,
         COUNT(*) FILTER (WHERE o.delta_volatility > 0)::int AS risk_reduction_cases,
         COALESCE(AVG(o.delta_volatility), 0) AS avg_delta_volatility,
         COUNT(*) FILTER (WHERE o.delta_return > 0)::int AS perf_improvement_cases,
         COALESCE(AVG(o.rai), 0) AS avg_rai,
         COUNT(*) FILTER (WHERE o.rai < 0)::int AS adverse_cases,
         COUNT(*) FILTER (WHERE o.rai = 0)::int AS neutral_cases,
         COUNT(*) FILTER (WHERE o.rai > 0)::int AS favorable_cases
       FROM horsai_signal_outcomes o
       INNER JOIN horsai_signals s ON s.id = o.signal_id
       WHERE o.user_id = $1
         AND o.portfolio_id = $2
         AND o.evaluated_at >= (CURRENT_DATE - ($3::int * INTERVAL '1 day'))::date`,
      [userId, portfolioId, boundedDays]
    );

    const row = out.rows?.[0] || {};
    return {
      windowDays: boundedDays,
      signalsAffectingPortfolio: toNum(row.total_signals, 0),
      riskReductionCases: toNum(row.risk_reduction_cases, 0),
      avgVolatilityReductionPct: Number((toNum(row.avg_delta_volatility, 0) * 100).toFixed(2)),
      performanceImprovementCases: toNum(row.perf_improvement_cases, 0),
      avgRelativeImpactPct: Number((toNum(row.avg_rai, 0) * 100).toFixed(2)),
      outcomes: {
        favorable: toNum(row.favorable_cases, 0),
        neutral: toNum(row.neutral_cases, 0),
        adverse: toNum(row.adverse_cases, 0)
      }
    };
  };

  return {
    upsertPortfolioScoreDaily,
    createSignal,
    applySignalAction,
    recordSignalOutcome,
    refreshConvictionPolicy,
    getSignalReview
  };
};

module.exports = { createHorsaiEngine };
