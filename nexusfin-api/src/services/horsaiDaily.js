const { withTrackedJobRun } = require('./jobRunTracker');
const { createHorsaiEngine } = require('./horsaiEngine');
const {
  resolveSuggestionLevel,
  canSuggestSpecificAssets,
  shouldReactivateSignal,
  computeRai
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

const daysBetween = (fromDate, toDate) => {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
};

const clamp01 = (value) => clamp(value, 0, 1);

const stdDev = (values = []) => {
  const nums = (Array.isArray(values) ? values : []).map((v) => Number(v)).filter(Number.isFinite);
  if (nums.length < 2) return 0;
  const mean = nums.reduce((acc, v) => acc + v, 0) / nums.length;
  const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(Math.max(variance, 0));
};

const maxDrawdown = (values = []) => {
  const nums = (Array.isArray(values) ? values : []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
  if (!nums.length) return 0;
  let peak = nums[0];
  let maxDd = 0;
  for (const v of nums) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
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

  const listSignalsPendingOutcome = async (runDate) => {
    const out = await query(
      `SELECT s.id,
              s.user_id,
              s.portfolio_id,
              s.regime,
              s.volatility_regime,
              s.confidence,
              s.adjustment,
              s.shown_at::date AS shown_date
       FROM horsai_signals s
       WHERE s.shown_at::date <= ($1::date - INTERVAL '7 day')::date
         AND NOT EXISTS (
           SELECT 1
           FROM horsai_signal_outcomes o
           WHERE o.signal_id = s.id
         )
       ORDER BY s.shown_at ASC
       LIMIT 400`,
      [runDate]
    );
    return out.rows || [];
  };

  const loadSnapshotSeries = async ({ portfolioId, fromDate, toDate }) => {
    const out = await query(
      `SELECT date::text AS date, total_value
       FROM portfolio_snapshots
       WHERE portfolio_id = $1
         AND date >= $2::date
         AND date <= $3::date
       ORDER BY date ASC`,
      [portfolioId, fromDate, toDate]
    );
    return out.rows || [];
  };

  const loadUserRiskLevel = async (userId) => {
    const out = await query(
      `SELECT risk_level
       FROM user_agent_profile
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    return clamp(toNum(out.rows?.[0]?.risk_level, 0.5), 0, 1);
  };

  const evaluateSignalOutcome = async ({ signal, runDate }) => {
    const windowDays = clamp(daysBetween(signal.shown_date, runDate), 7, 14);
    const snapshotRows = await loadSnapshotSeries({
      portfolioId: signal.portfolio_id,
      fromDate: signal.shown_date,
      toDate: runDate
    });
    if (snapshotRows.length < 2) return null;

    const totals = snapshotRows.map((row) => toNum(row.total_value, 0)).filter((v) => v > 0);
    if (totals.length < 2) return null;

    const first = totals[0];
    const last = totals[totals.length - 1];
    const dailyReturns = [];
    for (let i = 1; i < totals.length; i += 1) {
      const prev = totals[i - 1];
      const curr = totals[i];
      if (prev > 0) dailyReturns.push((curr - prev) / prev);
    }

    const actualReturn = first > 0 ? (last - first) / first : 0;
    const actualVolatility = stdDev(dailyReturns);
    const actualDrawdown = maxDrawdown(totals);

    const normalizedActual = {
      ret: clamp(actualReturn / 0.25, -1, 1),
      vol: clamp01(actualVolatility / 0.1),
      dd: clamp01(actualDrawdown / 0.2)
    };

    const regime = String(signal.regime || 'transition');
    const volatilityRegime = String(signal.volatility_regime || 'normal');
    const focus = String(signal.adjustment?.focus || '').toLowerCase();

    const volImprovement =
      volatilityRegime === 'crisis'
        ? 0.2
        : regime === 'risk_off'
          ? 0.16
          : regime === 'risk_on'
            ? 0.1
            : 0.12;
    const ddImprovement =
      volatilityRegime === 'crisis'
        ? 0.22
        : regime === 'risk_off'
          ? 0.18
          : regime === 'risk_on'
            ? 0.1
            : 0.14;
    const returnShiftBase = regime === 'risk_on' ? 0.06 : regime === 'risk_off' ? -0.01 : 0.02;
    const returnShift = focus.includes('risk') ? returnShiftBase - 0.01 : returnShiftBase;

    const normalizedAdjusted = {
      ret: clamp(normalizedActual.ret + returnShift, -1, 1),
      vol: clamp01(normalizedActual.vol * (1 - volImprovement)),
      dd: clamp01(normalizedActual.dd * (1 - ddImprovement))
    };

    const deltaReturn = Number((normalizedAdjusted.ret - normalizedActual.ret).toFixed(6));
    const deltaVolatility = Number((normalizedActual.vol - normalizedAdjusted.vol).toFixed(6));
    const deltaDrawdown = Number((normalizedActual.dd - normalizedAdjusted.dd).toFixed(6));

    const riskLevel = await loadUserRiskLevel(signal.user_id);
    const raiOut = computeRai({
      deltaReturn,
      deltaVolatility,
      deltaDrawdown,
      profile: {
        riskLevel,
        regime,
        volatilityRegime,
        confidence: toNum(signal.confidence, 0.5)
      }
    });

    return {
      windowDays,
      deltaReturn,
      deltaVolatility,
      deltaDrawdown,
      rai: raiOut.rai,
      portfolioSnapshot: {
        fromDate: signal.shown_date,
        toDate: runDate,
        points: snapshotRows.length,
        firstValue: Number(first.toFixed(4)),
        lastValue: Number(last.toFixed(4)),
        actual: {
          return: Number(actualReturn.toFixed(6)),
          volatility: Number(actualVolatility.toFixed(6)),
          drawdown: Number(actualDrawdown.toFixed(6))
        }
      },
      simulatedAdjustment: {
        assumptions: {
          regime,
          volatilityRegime,
          focus,
          volImprovement,
          ddImprovement,
          returnShift
        },
        adjustedNormalized: normalizedAdjusted,
        weights: raiOut.weights
      }
    };
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
        const usersForConvictionRefresh = new Set();

        let scored = 0;
        let generated = 0;
        let skippedByCooldown = 0;
        let outcomesEvaluated = 0;

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

        try {
          const pendingOutcomes = await listSignalsPendingOutcome(runDate);
          for (const signal of pendingOutcomes) {
            try {
              const evaluated = await evaluateSignalOutcome({ signal, runDate });
              if (!evaluated) continue;

              await horsaiEngine.recordSignalOutcome({
                signalId: signal.id,
                userId: signal.user_id,
                portfolioId: signal.portfolio_id,
                evaluatedAt: runDate,
                evalWindowDays: evaluated.windowDays,
                portfolioSnapshot: evaluated.portfolioSnapshot,
                simulatedAdjustment: evaluated.simulatedAdjustment,
                deltaReturn: evaluated.deltaReturn,
                deltaVolatility: evaluated.deltaVolatility,
                deltaDrawdown: evaluated.deltaDrawdown,
                rai: evaluated.rai
              });
              usersForConvictionRefresh.add(signal.user_id);
              outcomesEvaluated += 1;
            } catch (error) {
              logger.warn?.(`[horsaiDaily] failed outcome ${signal.id}`, error?.message || error);
            }
          }
        } catch (error) {
          logger.warn?.('[horsaiDaily] outcome evaluation stage failed', error?.message || error);
        }

        let convictionUpdated = 0;
        for (const userId of usersForConvictionRefresh) {
          try {
            await horsaiEngine.refreshConvictionPolicy({ userId });
            convictionUpdated += 1;
          } catch (error) {
            logger.warn?.(`[horsaiDaily] conviction refresh failed ${userId}`, error?.message || error);
          }
        }

        return {
          date: runDate,
          regime: regime.regime,
          volatilityRegime: regime.volatility_regime,
          portfoliosScanned: portfolios.length,
          scored,
          generated,
          skippedByCooldown,
          outcomesEvaluated,
          convictionUpdated
        };
      }
    });

  return {
    runGlobalDaily
  };
};

module.exports = { createHorsaiDailyService };
