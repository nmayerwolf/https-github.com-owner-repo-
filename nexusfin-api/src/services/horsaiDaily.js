const { withTrackedJobRun } = require('./jobRunTracker');
const { createHorsaiEngine } = require('./horsaiEngine');
const {
  resolveSuggestionLevel,
  canSuggestSpecificAssets,
  shouldReactivateSignal
} = require('./horsaiPolicy');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toDate = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
};

const toDatePlusDays = (date, days) => {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

const normalizeConfidenceBand = (confidence) => {
  const c = toNum(confidence, 0.5);
  if (c >= 0.75) return 'High';
  if (c >= 0.55) return 'Moderate';
  return 'Limited';
};

const defaultAdjustmentForRegime = ({ regime, volatilityRegime }) => {
  if (volatilityRegime === 'crisis') {
    return {
      focus: 'risk_reduction',
      action: 'increment_defensive_allocation',
      note: 'Reduce exposición concentrada y prioriza activos defensivos.'
    };
  }

  if (regime === 'risk_off') {
    return {
      focus: 'defensive_rotation',
      action: 'rebalance_to_stability',
      note: 'Incrementar estabilidad de cartera y bajar sensibilidad a drawdowns.'
    };
  }

  if (regime === 'risk_on') {
    return {
      focus: 'leadership_alignment',
      action: 'align_with_market_leadership',
      note: 'Alinear exposición con liderazgo de mercado sin aumentar concentración.'
    };
  }

  return {
    focus: 'risk_control',
    action: 'reduce_uncompensated_risk',
    note: 'Entorno mixto: priorizar consistencia y exposición balanceada.'
  };
};

const specificAssetsForRegime = (regime) => {
  if (regime === 'risk_off') {
    return [
      {
        symbol: 'TLT',
        diagnosis: 'Mejora diversificación defensiva en régimen risk_off.',
        impact: 'Puede reducir volatilidad y drawdown relativo frente a shocks macro.',
        adjustment: 'Evaluar incremento gradual de exposición defensiva.'
      }
    ];
  }

  if (regime === 'risk_on') {
    return [
      {
        symbol: 'SPY',
        diagnosis: 'Refuerza alineación con liderazgo broad market en risk_on.',
        impact: 'Puede mejorar alineación con régimen y reducir desvío estructural.',
        adjustment: 'Evaluar rebalance de exposición core sin apalancamiento.'
      }
    ];
  }

  return [];
};

const createHorsaiDailyService = ({ query, logger = console }) => {
  const horsaiEngine = createHorsaiEngine({ query });

  const loadLatestRegime = async () => {
    const out = await query(
      `SELECT date::text AS date, regime, volatility_regime, confidence
       FROM regime_state
       ORDER BY date DESC
       LIMIT 1`
    );

    return (
      out.rows?.[0] || {
        date: toDate(),
        regime: 'transition',
        volatility_regime: 'normal',
        confidence: 0.5
      }
    );
  };

  const listPortfolios = async () => {
    const out = await query(
      `SELECT id AS portfolio_id, user_id
       FROM portfolios
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC`
    );
    return out.rows || [];
  };

  const loadLatestAlignment = async (portfolioId) => {
    const out = await query(
      `SELECT alignment_score
       FROM portfolio_metrics
       WHERE portfolio_id = $1
       ORDER BY date DESC
       LIMIT 1`,
      [portfolioId]
    );

    return toNum(out.rows?.[0]?.alignment_score, 50);
  };

  const loadHistoricalAvgScore = async ({ userId, portfolioId, date }) => {
    const out = await query(
      `SELECT AVG(score_total) AS avg_score
       FROM horsai_portfolio_scores_daily
       WHERE user_id = $1
         AND portfolio_id = $2
         AND date < $3`,
      [userId, portfolioId, date]
    );

    return out.rows?.[0]?.avg_score == null ? null : toNum(out.rows[0].avg_score, 50);
  };

  const loadLatestSignal = async ({ userId, portfolioId }) => {
    const out = await query(
      `SELECT id, score, regime, volatility_regime, user_action, dismiss_streak,
              consecutive_display_days, cooldown_until, shown_at
       FROM horsai_signals
       WHERE user_id = $1
         AND portfolio_id = $2
       ORDER BY shown_at DESC
       LIMIT 1`,
      [userId, portfolioId]
    );

    return out.rows?.[0] || null;
  };

  const loadConfidenceThreshold = async (userId) => {
    const out = await query(
      `SELECT confidence_threshold
       FROM horsai_user_conviction_policy
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    return toNum(out.rows?.[0]?.confidence_threshold, 0.75);
  };

  const applyFiveDayCooldown = async ({ signalId, userId, runDate }) => {
    const until = toDatePlusDays(runDate, 5);
    await query(
      `UPDATE horsai_signals
       SET cooldown_until = $3,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [signalId, userId, until]
    );
  };

  const runGlobalDaily = async ({ date = null } = {}) =>
    withTrackedJobRun({
      query,
      jobName: 'horsai_daily',
      date,
      run: async (runDateInput) => {
        const runDate = toDate(runDateInput);
        const regime = await loadLatestRegime();
        const portfolios = await listPortfolios();

        let scored = 0;
        let generated = 0;
        let skippedByCooldown = 0;

        for (const portfolio of portfolios) {
          try {
            const [marketAlignment, historicalAvgScore, latestSignal, confidenceThreshold] = await Promise.all([
              loadLatestAlignment(portfolio.portfolio_id),
              loadHistoricalAvgScore({ userId: portfolio.user_id, portfolioId: portfolio.portfolio_id, date: runDate }),
              loadLatestSignal({ userId: portfolio.user_id, portfolioId: portfolio.portfolio_id }),
              loadConfidenceThreshold(portfolio.user_id)
            ]);

            const personalConsistency =
              historicalAvgScore == null
                ? 50
                : Number(clamp(100 - Math.abs(marketAlignment - historicalAvgScore) * 1.25, 0, 100).toFixed(2));

            const totalScore = Number(((marketAlignment + personalConsistency) / 2).toFixed(2));

            await horsaiEngine.upsertPortfolioScoreDaily({
              userId: portfolio.user_id,
              portfolioId: portfolio.portfolio_id,
              date: runDate,
              marketAlignment,
              personalConsistency,
              scoreTotal: totalScore
            });
            scored += 1;

            const level = resolveSuggestionLevel({
              score: totalScore,
              volatilityRegime: regime.volatility_regime
            });

            const bothLow = marketAlignment < 45 && personalConsistency < 45;
            if (!bothLow || level === 0) continue;

            const cooldownUntil = latestSignal?.cooldown_until ? toDate(latestSignal.cooldown_until) : null;
            if (cooldownUntil && runDate <= cooldownUntil) {
              skippedByCooldown += 1;
              continue;
            }

            const todaySignalAlreadyShown = latestSignal?.shown_at && toDate(latestSignal.shown_at) === runDate;
            if (todaySignalAlreadyShown) continue;

            if (latestSignal?.consecutive_display_days >= 3) {
              await applyFiveDayCooldown({ signalId: latestSignal.id, userId: portfolio.user_id, runDate });
              skippedByCooldown += 1;
              continue;
            }

            const reactivation = shouldReactivateSignal({
              previousScore: latestSignal?.score,
              currentScore: totalScore,
              previousRegime: latestSignal?.regime,
              currentRegime: regime.regime,
              previousVolatilityRegime: latestSignal?.volatility_regime,
              currentVolatilityRegime: regime.volatility_regime,
              consecutiveDisplayDays: latestSignal?.consecutive_display_days || 0
            });

            if (latestSignal && latestSignal.user_action !== 'pending' && !reactivation.shouldReactivate) {
              continue;
            }

            const confidence = clamp(toNum(regime.confidence, 0.5), 0, 1);
            if (confidence < confidenceThreshold) continue;

            const materialImpact = totalScore < 35;
            const allowSpecificAssets = canSuggestSpecificAssets({
              confidence,
              regime: regime.regime,
              materialImpact
            });

            const nextConsecutiveDisplayDays =
              latestSignal && latestSignal.user_action === 'pending' ? toNum(latestSignal.consecutive_display_days, 1) + 1 : 1;

            if (nextConsecutiveDisplayDays > 3) {
              if (latestSignal?.id) {
                await applyFiveDayCooldown({ signalId: latestSignal.id, userId: portfolio.user_id, runDate });
              }
              skippedByCooldown += 1;
              continue;
            }

            const diagnosis = `Market Alignment ${marketAlignment.toFixed(1)} y Personal Consistency ${personalConsistency.toFixed(1)} en zona baja.`;
            const riskImpact = `Contexto ${regime.regime} | Volatility ${regime.volatility_regime} | Confidence ${normalizeConfidenceBand(confidence)}.`;
            const adjustment = defaultAdjustmentForRegime({
              regime: regime.regime,
              volatilityRegime: regime.volatility_regime
            });

            await horsaiEngine.createSignal({
              userId: portfolio.user_id,
              portfolioId: portfolio.portfolio_id,
              score: totalScore,
              suggestionLevel: level,
              confidence,
              regime: regime.regime,
              volatilityRegime: regime.volatility_regime,
              diagnosis,
              riskImpact,
              adjustment,
              specificAssets: allowSpecificAssets ? specificAssetsForRegime(regime.regime) : [],
              consecutiveDisplayDays: nextConsecutiveDisplayDays,
              reactivatedAt: latestSignal && latestSignal.user_action !== 'pending' ? new Date().toISOString() : null
            });

            generated += 1;
          } catch (error) {
            logger.warn?.(`[horsaiDaily] failed portfolio ${portfolio.portfolio_id}`, error?.message || error);
          }
        }

        return {
          date: runDate,
          regime: regime.regime,
          volatilityRegime: regime.volatility_regime,
          portfoliosScanned: portfolios.length,
          scored,
          generated,
          skippedByCooldown
        };
      }
    });

  return {
    runGlobalDaily
  };
};

module.exports = { createHorsaiDailyService };
