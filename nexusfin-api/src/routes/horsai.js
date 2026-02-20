const express = require('express');
const { query } = require('../config/db');
const { badRequest, notFound } = require('../utils/errors');
const { createHorsaiEngine } = require('../services/horsaiEngine');

const router = express.Router();
const horsaiEngine = createHorsaiEngine({ query });

const ID_RE = /^[0-9a-f-]{36}$/i;

const toUuid = (value, label) => {
  const safe = String(value || '').trim();
  if (!ID_RE.test(safe)) throw badRequest(`${label} inválido`, 'VALIDATION_ERROR');
  return safe;
};

const toDays = (value) => {
  if (value == null || value === '') return 90;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 7 || n > 90) {
    throw badRequest('days inválido (7-90)', 'VALIDATION_ERROR');
  }
  return n;
};

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const resolveAccess = async ({ portfolioId, userId }) => {
  const out = await query(
    `SELECT p.id,
            CASE
              WHEN p.user_id = $2 THEN 'owner'
              ELSE COALESCE(pc.role, 'viewer')
            END AS role
     FROM portfolios p
     LEFT JOIN portfolio_collaborators pc
       ON pc.portfolio_id = p.id AND pc.user_id = $2
     WHERE p.id = $1
       AND p.deleted_at IS NULL
       AND (p.user_id = $2 OR pc.user_id IS NOT NULL)
     LIMIT 1`,
    [portfolioId, userId]
  );

  if (!out.rows.length) throw notFound('Portfolio no encontrado');
  return out.rows[0];
};

const marketEnvironmentLabels = (regime, volatilityRegime) => ({
  market:
    regime === 'risk_on'
      ? 'Supportive'
      : regime === 'risk_off'
        ? 'Defensive'
        : 'Mixed',
  volatility:
    volatilityRegime === 'crisis'
      ? 'High Uncertainty'
      : volatilityRegime === 'elevated'
        ? 'Increasing'
        : 'Calm'
});

router.get('/portfolio/:id/summary', async (req, res, next) => {
  try {
    const portfolioId = toUuid(req.params.id, 'portfolioId');
    await resolveAccess({ portfolioId, userId: req.user.id });

    const [regimeOut, metricOut, scoreOut, signalOut] = await Promise.all([
      query(
        `SELECT date, regime, volatility_regime, confidence
         FROM regime_state
         ORDER BY date DESC
         LIMIT 1`
      ),
      query(
        `SELECT alignment_score
         FROM portfolio_metrics
         WHERE portfolio_id = $1
         ORDER BY date DESC
         LIMIT 1`,
        [portfolioId]
      ),
      query(
        `SELECT date, market_alignment, personal_consistency, score_total
         FROM horsai_portfolio_scores_daily
         WHERE user_id = $1 AND portfolio_id = $2
         ORDER BY date DESC
         LIMIT 1`,
        [req.user.id, portfolioId]
      ),
      query(
        `SELECT id, score, suggestion_level, confidence, regime, volatility_regime, diagnosis, risk_impact,
                adjustment, specific_assets, user_action, cooldown_until, shown_at
         FROM horsai_signals
         WHERE user_id = $1
           AND portfolio_id = $2
         ORDER BY shown_at DESC
         LIMIT 1`,
        [req.user.id, portfolioId]
      )
    ]);

    const regime = regimeOut.rows?.[0] || {
      regime: 'transition',
      volatility_regime: 'normal',
      confidence: 0.5,
      date: new Date().toISOString().slice(0, 10)
    };

    const latestScore = scoreOut.rows?.[0];
    const marketAlignment =
      latestScore?.market_alignment == null
        ? toNum(metricOut.rows?.[0]?.alignment_score, 50)
        : toNum(latestScore.market_alignment, 50);
    const personalConsistency = latestScore?.personal_consistency == null ? 50 : toNum(latestScore.personal_consistency, 50);
    const totalScore = latestScore?.score_total == null ? Number(((marketAlignment + personalConsistency) / 2).toFixed(2)) : toNum(latestScore.score_total, 50);

    await horsaiEngine.upsertPortfolioScoreDaily({
      userId: req.user.id,
      portfolioId,
      date: regime.date,
      marketAlignment,
      personalConsistency,
      scoreTotal: totalScore
    });

    const signal = signalOut.rows?.[0] || null;

    return res.json({
      portfolioId,
      marketEnvironment: {
        regime: regime.regime,
        volatilityRegime: regime.volatility_regime,
        confidence: toNum(regime.confidence, 0.5),
        labels: marketEnvironmentLabels(regime.regime, regime.volatility_regime)
      },
      scores: {
        marketAlignment: Number(marketAlignment.toFixed(2)),
        personalConsistency: Number(personalConsistency.toFixed(2)),
        total: Number(totalScore.toFixed(2))
      },
      suggestion: signal
        ? {
            id: signal.id,
            level: Number(signal.suggestion_level),
            score: Number(signal.score),
            confidence: Number(signal.confidence),
            diagnosis: signal.diagnosis,
            riskImpact: signal.risk_impact,
            adjustment: signal.adjustment || {},
            specificAssets: Array.isArray(signal.specific_assets) ? signal.specific_assets : [],
            action: signal.user_action,
            cooldownUntil: signal.cooldown_until,
            shownAt: signal.shown_at
          }
        : null
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/signals/:id/action', async (req, res, next) => {
  try {
    const signalId = toUuid(req.params.id, 'signalId');
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!['acknowledge', 'dismiss'].includes(action)) {
      throw badRequest('action inválida (acknowledge|dismiss)', 'VALIDATION_ERROR');
    }

    const updated = await horsaiEngine.applySignalAction({ signalId, userId: req.user.id, action });
    if (!updated) throw notFound('Signal no encontrado', 'SIGNAL_NOT_FOUND');

    return res.json({
      signalId: updated.id,
      action: updated.user_action,
      dismissStreak: Number(updated.dismiss_streak || 0),
      cooldownUntil: updated.cooldown_until,
      updatedAt: updated.updated_at
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/portfolio/:id/signal-review', async (req, res, next) => {
  try {
    const portfolioId = toUuid(req.params.id, 'portfolioId');
    const days = toDays(req.query.days);
    await resolveAccess({ portfolioId, userId: req.user.id });

    const review = await horsaiEngine.getSignalReview({ userId: req.user.id, portfolioId, days });

    return res.json({
      portfolioId,
      title: 'Signal Review - Last 90 Days',
      windowDays: review.windowDays,
      metrics: {
        signalsAffectingPortfolio: review.signalsAffectingPortfolio,
        riskReductionCases: review.riskReductionCases,
        avgVolatilityReductionPct: review.avgVolatilityReductionPct,
        performanceImprovementCases: review.performanceImprovementCases,
        avgRelativeImpactPct: review.avgRelativeImpactPct
      },
      outcomes: review.outcomes
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
