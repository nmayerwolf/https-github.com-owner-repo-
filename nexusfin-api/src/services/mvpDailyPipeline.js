const { createMvpNarrativeService } = require('./mvpNarrative');
const { withTrackedJobRun } = require('./jobRunTracker');
const { toEvent, toBullet, toIdeaState } = require('../constants/decisionContracts');

const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const isoDate = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const SHOCK_EVENT_TAGS = new Set(['war', 'invasion', 'terror_attack', 'earthquake_major', 'bank_failure', 'default', 'sanctions_major']);
const DAILY_BRIEF_IDEAL_BULLETS = 5;
const DAILY_BRIEF_HARD_CAP_BULLETS = 10;
const EXTRA_BRIEF_RELEVANCE_THRESHOLD = 6.2;
const HORIZON_DAYS_BY_TIMEFRAME = {
  weeks: 21,
  months: 63
};
const MAX_ALPHA_IDEAS_DAILY = 3;

const mean = (values = []) => {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
};

const stdDevSample = (values = []) => {
  if (values.length < 2) return null;
  const m = mean(values);
  if (!Number.isFinite(m)) return null;
  const variance = values.reduce((acc, value) => acc + Math.pow(value - m, 2), 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
};

const computeVol20dZ = (history = []) => {
  const rows = (Array.isArray(history) ? history : [])
    .map((row) => ({ date: String(row.date || ''), vol20d: toNum(row.vol_20d, null) }))
    .filter((row) => row.date && Number.isFinite(row.vol20d))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length < 25) return null;
  const last = rows[rows.length - 1].vol20d;
  const baseline = rows.slice(Math.max(0, rows.length - 61), rows.length - 1).map((x) => x.vol20d).filter(Number.isFinite);
  if (baseline.length < 20) return null;
  const sigma = stdDevSample(baseline);
  if (!Number.isFinite(sigma) || sigma <= 0) return null;
  const mu = mean(baseline);
  if (!Number.isFinite(mu)) return null;
  return Number(((last - mu) / sigma).toFixed(4));
};

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const summarizeRegime = (regime, confidence) => {
  if (regime === 'risk_on') return `Regime Today: Risk-on (${Math.round(confidence * 100)}% confidence).`;
  if (regime === 'risk_off') return `Regime Today: Risk-off (${Math.round(confidence * 100)}% confidence).`;
  return `Regime Today: Transition (${Math.round(confidence * 100)}% confidence).`;
};

const toIsoDay = (value) => String(value || '').slice(0, 10);

const addDaysIso = (dateStr, days) => {
  const [yy, mm, dd] = toIsoDay(dateStr)
    .split('-')
    .map((x) => Number(x));
  if (!yy || !mm || !dd) return toIsoDay(dateStr);
  const dt = new Date(Date.UTC(yy, mm - 1, dd + Number(days || 0)));
  return dt.toISOString().slice(0, 10);
};

const classifyIdeaTheme = (idea = {}) => {
  const tags = Array.isArray(idea.tags) ? idea.tags.map((x) => String(x || '').toLowerCase()) : [];
  const preferred = ['energy', 'technology', 'financials', 'healthcare', 'industrials', 'consumer_staples', 'consumer_discretionary', 'utilities', 'materials', 'real_estate', 'credit', 'rates', 'metals', 'crypto'];
  for (const theme of preferred) {
    if (tags.includes(theme)) return theme;
  }
  return idea.category === 'opportunistic' ? 'special_situations' : 'broad_equity';
};

const toConvictionScore = (idea = {}, regimeState = {}) => {
  const raw = idea.rawScores || {};
  const ret1m = toNum(raw.ret1m, 0);
  const ret3m = toNum(raw.ret3m, 0);
  const vol20d = toNum(raw.vol20d, 0.02);
  const primary = toNum(raw.score, toNum(idea.confidence, 0));
  const regime = String(regimeState.regime || 'transition');

  const macroAlignment =
    regime === 'risk_on' ? (idea.action === 'BUY' ? 2 : 1) : regime === 'risk_off' ? (idea.action === 'SELL' ? 2 : 1) : 1.4;
  const flowConfirmation = clamp01(0.4 + Math.abs(ret1m) * 3 + (idea.category === 'opportunistic' ? 0.1 : 0)) * 2;
  const fundamentalsMomentum = clamp01(0.35 + Math.max(0, primary) * 2) * 2;
  const relativeStrength = clamp01(0.35 + (ret1m + ret3m) * 1.2) * 2;
  const riskReward = clamp01(0.75 - vol20d * 8 + Math.abs(ret1m) * 0.9) * 2;

  const total = macroAlignment + flowConfirmation + fundamentalsMomentum + relativeStrength + riskReward;
  return {
    score: Number(Math.max(0, Math.min(10, total)).toFixed(1)),
    breakdown: {
      macroAlignment: Number(macroAlignment.toFixed(2)),
      flowConfirmation: Number(flowConfirmation.toFixed(2)),
      fundamentalsMomentum: Number(fundamentalsMomentum.toFixed(2)),
      relativeStrength: Number(relativeStrength.toFixed(2)),
      riskReward: Number(riskReward.toFixed(2))
    }
  };
};

const withIdeaState = (idea = {}, date) => {
  const horizonDays = HORIZON_DAYS_BY_TIMEFRAME[String(idea.timeframe || '').toLowerCase()] || 21;
  const nextReviewDate = addDaysIso(date, Math.min(14, Math.max(5, Math.round(horizonDays / 3))));
  const expiryDate = addDaysIso(date, horizonDays);
  return {
    ...idea,
    ideaState: toIdeaState({
      horizonDays,
      createdDate: date,
      nextReviewDate,
      expiryDate,
      status: 'active',
      reviewSuggestion: 'extend',
      daysRemaining: horizonDays
    })
  };
};

const buildRegimeFromMetrics = (rows = [], inputs = {}) => {
  const bySymbol = new Map();
  for (const row of rows) bySymbol.set(String(row.symbol || '').toUpperCase(), row);

  const spy = bySymbol.get('SPY') || {};
  const qqq = bySymbol.get('QQQ') || {};
  const iwm = bySymbol.get('IWM') || {};
  const hyg = bySymbol.get('HYG') || {};
  const ief = bySymbol.get('IEF') || {};
  const tlt = bySymbol.get('TLT') || {};

  const spyRet1m = toNum(spy.ret_1m);
  const spyRet1d = toNum(spy.ret_1d);
  const qqqRet1m = toNum(qqq.ret_1m);
  const iwmRet1m = toNum(iwm.ret_1m);
  const hygRet1m = toNum(hyg.ret_1m);
  const iefRet1m = toNum(ief.ret_1m);
  const tltRet1m = toNum(tlt.ret_1m);
  const spyVol20d = toNum(spy.vol_20d);
  const spyVol20dZ = Number.isFinite(Number(inputs.spyVol20dZ)) ? Number(inputs.spyVol20dZ) : null;

  let riskOnVotes = 0;
  let riskOffVotes = 0;
  const macroDrivers = [];
  const riskFlags = [];

  if (spyRet1m > 0.01) {
    riskOnVotes += 1;
    macroDrivers.push('SPY trend positiva 1M');
  } else if (spyRet1m < -0.01) {
    riskOffVotes += 1;
    riskFlags.push('SPY debilidad 1M');
  }

  if (qqqRet1m > iwmRet1m) {
    riskOnVotes += 1;
    macroDrivers.push('Liderazgo growth (QQQ > IWM)');
  } else {
    riskOffVotes += 1;
    riskFlags.push('Liderazgo defensivo/small caps débiles');
  }

  if (hygRet1m > iefRet1m) {
    riskOnVotes += 1;
    macroDrivers.push('Crédito estable (HYG > IEF)');
  } else {
    riskOffVotes += 1;
    riskFlags.push('Estrés de crédito relativo');
  }

  if (tltRet1m > 0.015) {
    riskFlags.push('Duration/rates en movimiento defensivo');
  }

  let volatilityRegime = 'normal';
  if (Number.isFinite(spyVol20dZ)) {
    if (spyVol20dZ >= 2.0 || spyRet1d <= -0.03) volatilityRegime = 'crisis';
    else if (spyVol20dZ >= 1.0) volatilityRegime = 'elevated';
  } else {
    if (spyVol20d >= 0.035 || spyRet1d <= -0.03) volatilityRegime = 'crisis';
    else if (spyVol20d >= 0.025) volatilityRegime = 'elevated';
  }

  let regime = 'transition';
  if (volatilityRegime === 'crisis' || riskOffVotes >= 2) regime = 'risk_off';
  else if (riskOnVotes >= 2 && volatilityRegime === 'normal') regime = 'risk_on';

  const leadershipCandidates = [
    ['mega_cap_tech', toNum(qqq.ret_1m)],
    ['small_caps', toNum(iwm.ret_1m)],
    ['credit', toNum(hyg.ret_1m)],
    ['duration', toNum(tlt.ret_1m)]
  ]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([theme]) => theme);

  const rawConfidence = 0.5 + Math.min(0.35, Math.abs(riskOnVotes - riskOffVotes) * 0.08);
  const confidence = clamp01(volatilityRegime === 'crisis' ? rawConfidence + 0.1 : rawConfidence);

  return {
    regime,
    volatilityRegime,
    leadership: leadershipCandidates,
    macroDrivers,
    riskFlags,
    confidence,
    indicators: {
      spyRet1d,
      spyVol20d,
      spyVol20dZ
    }
  };
};

const buildStrategicIdea = ({ date, symbol, name, sector, tags, metrics, regimeState }) => {
  const ret1w = toNum(metrics.ret_1w);
  const ret1m = toNum(metrics.ret_1m);
  const ret3m = toNum(metrics.ret_3m);
  const vol20d = toNum(metrics.vol_20d);
  const score = ret1w * 0.2 + ret1m * 0.45 + ret3m * 0.35 - vol20d * 0.35;

  const action = score > 0.01 ? 'BUY' : score < -0.015 ? 'SELL' : 'WATCH';
  const confidence = clamp01(0.45 + Math.min(0.45, Math.abs(score) * 4));

  const aligned = regimeState.regime === 'risk_on' ? score >= 0 : score <= 0;
  const adjustedConfidence = clamp01(aligned ? confidence + 0.05 : confidence - 0.05);

  return {
    date,
    ideaId: `str-${slugify(symbol)}-${date}`,
    category: 'strategic',
    symbol,
    action,
    confidence: adjustedConfidence,
    timeframe: ret3m >= 0 ? 'months' : 'weeks',
    invalidation: action === 'BUY' ? 'Cerrar si pierde tendencia de 1M y momentum 1W.' : 'Cerrar si recupera momentum 1M.',
    rationale: [
      `Retornos 1W/1M/3M: ${(ret1w * 100).toFixed(1)}% / ${(ret1m * 100).toFixed(1)}% / ${(ret3m * 100).toFixed(1)}%.`,
      `Volatilidad 20D: ${(vol20d * 100).toFixed(1)}%.`,
      `Alineación con régimen ${regimeState.regime}.`
    ],
    risks: [
      `Riesgo de reversión en ${symbol}.`,
      regimeState.volatilityRegime === 'crisis' ? 'Contexto de crisis aumenta falsos quiebres.' : 'Cambios macro pueden invalidar la tesis.'
    ],
    tags: Array.from(new Set([...(Array.isArray(tags) ? tags : []), String(sector || '').toLowerCase(), 'strategic'])).filter(Boolean),
    rawScores: { score, ret1w, ret1m, ret3m, vol20d }
  };
};

const buildOpportunisticIdea = ({ date, symbol, sector, tags, metrics, fundamentals, regimeState }) => {
  const pePct = toNum(fundamentals.pe_percentile, 0.5);
  const evPct = toNum(fundamentals.ev_ebitda_percentile, 0.5);
  const fcfPct = toNum(fundamentals.fcf_yield_percentile, 0.5);
  const ret1w = toNum(metrics.ret_1w);
  const ret1m = toNum(metrics.ret_1m);
  const valueScore = (1 - pePct) * 0.4 + (1 - evPct) * 0.3 + fcfPct * 0.3;
  const sentimentScore = Math.max(0, (-ret1w * 6 + -ret1m * 3));
  const score = valueScore * 0.7 + sentimentScore * 0.3;

  if (score < 0.38) return null;

  let opportunisticType = 'value_dislocation';
  if (ret1w <= -0.08) opportunisticType = 'overreaction';
  if (regimeState.regime === 'risk_off' && ret1m > 0.03) opportunisticType = 'macro_divergence';

  const frictionPenalty = regimeState.regime === 'risk_off' ? 0.08 : 0;
  const confidence = clamp01(0.4 + Math.min(0.45, score * 0.6) - frictionPenalty);

  return {
    date,
    ideaId: `opp-${slugify(symbol)}-${date}`,
    category: 'opportunistic',
    symbol,
    action: 'WATCH',
    confidence,
    timeframe: 'weeks',
    invalidation: 'Descartar si no hay estabilización de precio en 5-10 ruedas.',
    rationale: [
      `Percentiles fundamentales atractivos: PE ${(pePct * 100).toFixed(0)}p / EV ${(evPct * 100).toFixed(0)}p / FCF ${(fcfPct * 100).toFixed(0)}p.`,
      `Shock de precio reciente: 1W ${(ret1w * 100).toFixed(1)}%, 1M ${(ret1m * 100).toFixed(1)}%.`,
      'Setup oportunístico, no tesis estructural base.'
    ],
    risks: [
      'Puede convertirse en trampa de valor.',
      'Mayor sensibilidad a noticias idiosincráticas.'
    ],
    tags: Array.from(new Set([...(Array.isArray(tags) ? tags : []), String(sector || '').toLowerCase(), 'opportunistic'])).filter(Boolean),
    opportunisticType,
    rawScores: { valueScore, sentimentScore, score, pePct, evPct, fcfPct }
  };
};

const buildRiskIdeas = ({ date, regimeState }) => {
  const out = [];
  if (regimeState.volatilityRegime !== 'normal') {
    out.push({
      date,
      ideaId: `risk-vol-${date}`,
      category: 'risk',
      symbol: null,
      action: 'WATCH',
      confidence: clamp01(regimeState.volatilityRegime === 'crisis' ? 0.9 : 0.75),
      timeframe: 'weeks',
      invalidation: 'Reducir prioridad cuando vuelva a volatilidad normal.',
      rationale: [`Volatilidad en régimen ${regimeState.volatilityRegime}.`, 'Mayor probabilidad de movimientos extremos.'],
      risks: ['Aumento de drawdowns y slippage.'],
      tags: ['risk', 'volatility'],
      severity: regimeState.volatilityRegime === 'crisis' ? 'high' : 'med',
      rawScores: { volatilityRegime: regimeState.volatilityRegime }
    });
  }

  if (regimeState.regime === 'transition') {
    out.push({
      date,
      ideaId: `risk-transition-${date}`,
      category: 'risk',
      symbol: null,
      action: 'WATCH',
      confidence: 0.68,
      timeframe: 'weeks',
      invalidation: 'Confirmación de régimen risk-on/risk-off.',
      rationale: ['Regime transition detectado.', 'Menor consistencia en señales direccionales.'],
      risks: ['Rango lateral y whipsaws.'],
      tags: ['risk', 'regime_shift'],
      severity: 'med',
      rawScores: { regime: 'transition' }
    });
  }

  if (!out.length) {
    out.push({
      date,
      ideaId: `risk-monitor-${date}`,
      category: 'risk',
      symbol: null,
      action: 'WATCH',
      confidence: 0.58,
      timeframe: 'weeks',
      invalidation: 'Sin cambios relevantes.',
      rationale: ['Monitoreo preventivo de riesgos macro.'],
      risks: ['Eventos exógenos no anticipados.'],
      tags: ['risk'],
      severity: 'low',
      rawScores: {}
    });
  }

  return out;
};

const toCrisisBanner = (crisisState = {}) => ({
  isActive: Boolean(crisisState.isActive),
  title: Boolean(crisisState.isActive) ? 'High Volatility Environment' : 'Normal Market Environment',
  summary: String(
    crisisState.summary ||
      (crisisState.isActive
        ? 'Contexto de alta volatilidad: priorizamos alertas y reducimos ideas tácticas.'
        : 'Contexto de mercado sin señales de crisis activa.')
  ),
  learnMore: {
    triggers: Array.isArray(crisisState.triggers) ? crisisState.triggers : [],
    changes: Boolean(crisisState.isActive)
      ? [
          'Sube el umbral de confianza (+0.10).',
          'Se reduce el número de ideas mostradas.',
          'Risk alerts pasan al tope del feed.'
        ]
      : []
  }
});

const createMvpDailyPipeline = ({ query, logger = console, narrativeService = createMvpNarrativeService() }) => {
  const resolveRunDate = async (requestedDate = null) => {
    if (requestedDate) return String(requestedDate);
    const out = await query('SELECT MAX(date)::text AS date FROM market_metrics_daily');
    return String(out.rows?.[0]?.date || isoDate());
  };

  const loadMetricsUniverse = async (date) => {
    const out = await query(
      `SELECT m.symbol, m.ret_1d, m.ret_1w, m.ret_1m, m.ret_3m, m.vol_20d, m.vol_60d, m.ma20, m.ma50,
              u.name, u.sector, u.tags
       FROM market_metrics_daily m
       JOIN universe_symbols u ON u.symbol = m.symbol
       WHERE m.date = $1
         AND u.is_active = TRUE`,
      [date]
    );
    return out.rows;
  };

  const loadSpyVolHistory = async (date) => {
    const out = await query(
      `SELECT date::text AS date, vol_20d
       FROM market_metrics_daily
       WHERE symbol = 'SPY'
         AND date <= $1
       ORDER BY date DESC
       LIMIT 90`,
      [date]
    );
    return out.rows || [];
  };

  const runRegimeDaily = async (date) => {
    const [metricsRows, spyVolHistory] = await Promise.all([loadMetricsUniverse(date), loadSpyVolHistory(date)]);
    const spyVol20dZ = computeVol20dZ(spyVolHistory);
    const regime = buildRegimeFromMetrics(metricsRows, { spyVol20dZ });

    const macroDrivers = [...(regime.macroDrivers || [])];
    if (Number.isFinite(spyVol20dZ)) macroDrivers.push(`SPY vol_20d_z=${spyVol20dZ}`);

    await query(
      `INSERT INTO regime_state (date, regime, volatility_regime, leadership, macro_drivers, risk_flags, confidence)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7)
       ON CONFLICT (date)
       DO UPDATE SET
         regime = EXCLUDED.regime,
         volatility_regime = EXCLUDED.volatility_regime,
         leadership = EXCLUDED.leadership,
         macro_drivers = EXCLUDED.macro_drivers,
         risk_flags = EXCLUDED.risk_flags,
         confidence = EXCLUDED.confidence`,
      [
        date,
        regime.regime,
        regime.volatilityRegime,
        JSON.stringify(regime.leadership),
        JSON.stringify(macroDrivers),
        JSON.stringify(regime.riskFlags),
        regime.confidence
      ]
    );

    return { ...regime, macroDrivers, metricsRows };
  };

  const runCrisisModeCheck = async (date, regimeState, opts = {}) => {
    let shockEventFlag = Boolean(opts.shockEventFlag);
    if (!shockEventFlag) {
      const newsOut = await query(
        `SELECT tags
         FROM news_items
         WHERE ts >= ($1::date - INTERVAL '1 day')
           AND ts < ($1::date + INTERVAL '1 day')
         ORDER BY ts DESC
         LIMIT 300`,
        [date]
      );
      shockEventFlag = (newsOut.rows || []).some((row) =>
        (Array.isArray(row.tags) ? row.tags : []).some((tag) => SHOCK_EVENT_TAGS.has(String(tag || '').toLowerCase()))
      );
    }

    const isActive = regimeState.volatilityRegime === 'crisis' || (regimeState.volatilityRegime === 'elevated' && shockEventFlag);
    const triggers = [];
    if (regimeState.volatilityRegime === 'crisis') triggers.push('volatility_regime=crisis');
    if (regimeState.volatilityRegime === 'elevated') triggers.push('volatility_regime=elevated');
    if (shockEventFlag) triggers.push('high_impact_event_flag');

    const summary = isActive
      ? 'High volatility mode active. Confidence thresholds raised and risk alerts prioritized.'
      : 'Crisis mode inactive. Normal recommendation policy.';

    await query(
      `INSERT INTO crisis_state (date, is_active, triggers, summary, learn_more, started_at, last_updated_at)
       VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,CASE WHEN $2 THEN NOW() ELSE NULL END,NOW())
       ON CONFLICT (date)
       DO UPDATE SET
         is_active = EXCLUDED.is_active,
         triggers = EXCLUDED.triggers,
         summary = EXCLUDED.summary,
         learn_more = EXCLUDED.learn_more,
         started_at = CASE
           WHEN crisis_state.is_active = FALSE AND EXCLUDED.is_active = TRUE THEN NOW()
           ELSE crisis_state.started_at
         END,
         last_updated_at = NOW()`,
      [
        date,
        isActive,
        JSON.stringify(triggers),
        summary,
        JSON.stringify({
          triggers,
          changedPolicy: isActive,
          inputs: {
            spy_ret_1d: toNum(regimeState?.indicators?.spyRet1d, null),
            spy_vol_20d: toNum(regimeState?.indicators?.spyVol20d, null),
            spy_vol_20d_z: toNum(regimeState?.indicators?.spyVol20dZ, null),
            shock_event_flag: shockEventFlag
          }
        })
      ]
    );

    return { isActive, triggers, summary, shockEventFlag };
  };

  const runRecommendationsDaily = async (date, regimeState, crisisState, metricsRows) => {
    const fundamentalsOut = await query(
      `SELECT symbol, pe_percentile, ev_ebitda_percentile, fcf_yield_percentile, sector
       FROM fundamentals_derived
       WHERE asof_date = (SELECT MAX(asof_date) FROM fundamentals_derived)`
    );
    const fundamentalsBySymbol = new Map();
    for (const row of fundamentalsOut.rows) fundamentalsBySymbol.set(String(row.symbol || '').toUpperCase(), row);

    const strategicIdeas = metricsRows
      .map((row) =>
        buildStrategicIdea({
          date,
          symbol: row.symbol,
          name: row.name,
          sector: row.sector,
          tags: row.tags,
          metrics: row,
          regimeState
        })
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20);

    const opportunisticIdeas = metricsRows
      .map((row) =>
        buildOpportunisticIdea({
          date,
          symbol: row.symbol,
          sector: row.sector,
          tags: row.tags,
          metrics: row,
          fundamentals: fundamentalsBySymbol.get(String(row.symbol || '').toUpperCase()) || {},
          regimeState
        })
      )
      .filter(Boolean)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 12);

    const riskIdeas = buildRiskIdeas({ date, regimeState });

    const allBaseIdeas = [...strategicIdeas, ...opportunisticIdeas, ...riskIdeas];

    await query('DELETE FROM base_ideas WHERE date = $1', [date]);
    for (const idea of allBaseIdeas) {
      await query(
        `INSERT INTO base_ideas (
          date, idea_id, category, symbol, action, confidence, timeframe, invalidation,
          rationale, risks, tags, severity, opportunistic_type, raw_scores
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14::jsonb)`,
        [
          date,
          idea.ideaId,
          idea.category,
          idea.symbol,
          idea.action,
          idea.confidence,
          idea.timeframe,
          idea.invalidation,
          JSON.stringify(idea.rationale || []),
          JSON.stringify(idea.risks || []),
          JSON.stringify(idea.tags || []),
          idea.severity || null,
          idea.opportunisticType || null,
          JSON.stringify(idea.rawScores || {})
        ]
      );
    }

    const usersOut = await query('SELECT id FROM users ORDER BY created_at ASC');
    let generatedUsers = 0;

    for (const user of usersOut.rows) {
      const profileOut = await query(
        `SELECT preset_type, risk_level, horizon, focus
         FROM user_agent_profile
         WHERE user_id = $1`,
        [user.id]
      );
      const profile = profileOut.rows[0] || { preset_type: 'balanced', risk_level: 0.5, horizon: 0.5, focus: 0.5 };
      const riskLevel = clamp01(profile.risk_level);
      const minConviction = Math.max(4.8, 5.6 + (1 - riskLevel) * 1.2 + (crisisState.isActive ? 0.4 : 0));

      const rankedCandidates = [...strategicIdeas, ...opportunisticIdeas]
        .map((idea) => {
          const conviction = toConvictionScore(idea, regimeState);
          return withIdeaState(
            {
              ...idea,
              convictionScore: conviction.score,
              convictionBreakdown: conviction.breakdown,
              theme: classifyIdeaTheme(idea)
            },
            date
          );
        })
        .sort((a, b) => b.convictionScore - a.convictionScore);

      const fallbackIdea = rankedCandidates[0] || null;
      const filteredAlphaIdeas = rankedCandidates.filter((idea) => idea.convictionScore >= minConviction);
      const mainIdeas = (filteredAlphaIdeas.length ? filteredAlphaIdeas : fallbackIdea ? [fallbackIdea] : []).slice(0, MAX_ALPHA_IDEAS_DAILY);
      const topRisk = (riskIdeas || []).slice(0, 1);

      const selected = [...mainIdeas, ...topRisk].filter(Boolean);
      const narrative = await narrativeService.polishRecommendationItems({
        profile,
        regimeState,
        crisisState,
        items: selected
      });
      const narrativeById = new Map(
        Array.isArray(narrative.items)
          ? narrative.items.map((x) => [
              String(x.ideaId || ''),
              {
                rationale: x.rationale,
                risks: x.risks
              }
            ])
          : []
      );
      const finalAlphaIdeas = mainIdeas.map((idea) => {
        const polished = narrativeById.get(String(idea.ideaId || ''));
        if (!polished) return idea;
        return {
          ...idea,
          rationale: polished.rationale || idea.rationale,
          risks: polished.risks || idea.risks
        };
      });
      const finalItems = [...finalAlphaIdeas, ...topRisk].filter(Boolean);

      await query(
        `INSERT INTO user_recommendations (user_id, date, items, updated_at)
         VALUES ($1,$2,$3::jsonb,NOW())
         ON CONFLICT (user_id, date)
         DO UPDATE SET items = EXCLUDED.items, updated_at = NOW()`,
        [user.id, date, JSON.stringify(finalItems)]
      );

      generatedUsers += 1;
    }

    return {
      baseIdeas: allBaseIdeas.length,
      users: generatedUsers
    };
  };

  const classifyNewsBucket = (item = {}) => {
    const text = `${String(item.headline || '').toLowerCase()} ${String(item.summary || '').toLowerCase()}`;
    if (/fed|ecb|inflation|rate|cpi|gdp|yield|treasury|recession/.test(text)) return 'macro';
    if (/warning|downgrade|risk|volatility|stress|default|credit/.test(text)) return 'risk';
    if ((Array.isArray(item.tickers) ? item.tickers.length : 0) > 0) return 'company';
    return 'sector';
  };

  const dedupeNewsEvents = (items = []) => {
    const seen = new Set();
    const out = [];
    for (const raw of items) {
      const event = toEvent(raw);
      const key = `${event.headline.toLowerCase()}|${event.tickers.join(',')}`;
      if (!event.headline || seen.has(key)) continue;
      seen.add(key);
      out.push(event);
    }
    return out;
  };

  const scoreCapitalRelevance = ({ event, bucket, profile, preferred, regimeState }) => {
    const tags = new Set(Array.isArray(event.tags) ? event.tags : []);
    let score = bucket === 'macro' ? 5.2 : bucket === 'risk' ? 4.8 : bucket === 'company' ? 4.2 : 3.7;
    for (const tag of tags) {
      if (preferred.has(tag)) score += 1.4;
    }
    score += (toNum(profile.focus) - 0.5) * (bucket === 'macro' ? 1.1 : 0.4);
    if (regimeState.regime === 'risk_off' && bucket === 'risk') score += 0.8;
    if (regimeState.regime === 'risk_on' && bucket === 'company') score += 0.4;

    const ageHours = Math.max(0, (Date.now() - Date.parse(event.ts || 0)) / 3600000);
    if (Number.isFinite(ageHours)) score += Math.max(0, 0.8 - ageHours * 0.03);
    return score;
  };

  const formatCapitalBriefBullet = ({ event, bucket, regimeState }) => {
    const eventText = event.headline || 'Evento relevante';
    const impactText =
      bucket === 'risk'
        ? 'sube prima de riesgo y volatilidad'
        : bucket === 'macro'
          ? 'ajusta expectativas de tasas y crecimiento'
          : bucket === 'company'
            ? 'mueve valuaciones del sector ligado'
            : 'rota flujos entre sectores';
    const reasonText =
      regimeState.regime === 'risk_off'
        ? 'importa para proteger capital y priorizar calidad'
        : regimeState.regime === 'risk_on'
          ? 'importa para capturar continuidad de tendencia'
          : 'importa para no sobrerreaccionar en transición';

    return toBullet({
      event: eventText,
      marketImpact: impactText,
      whyItMatters: reasonText
    }).line;
  };

  const runNewsDigestDaily = async (date, regimeState, crisisState) => {
    const usersOut = await query('SELECT id FROM users ORDER BY created_at ASC');
    const newsOut = await query(
      `SELECT id, headline, summary, tags, tickers, ts
       FROM news_items
       WHERE ts >= ($1::date - INTERVAL '1 day') AND ts < ($1::date + INTERVAL '1 day')
       ORDER BY ts DESC
       LIMIT 200`,
      [date]
    );

    const newsRows = newsOut.rows || [];

    for (const user of usersOut.rows) {
      const profileOut = await query(
        `SELECT preset_type, risk_level, horizon, focus, preferred_tags, excluded_tags
         FROM user_agent_profile
         WHERE user_id = $1`,
        [user.id]
      );
      const profile = profileOut.rows[0] || { preset_type: 'balanced', risk_level: 0.5, horizon: 0.5, focus: 0.5, preferred_tags: [], excluded_tags: [] };

      const preferred = new Set((Array.isArray(profile.preferred_tags) ? profile.preferred_tags : []).map((x) => String(x).toLowerCase()));
      const excluded = new Set((Array.isArray(profile.excluded_tags) ? profile.excluded_tags : []).map((x) => String(x).toLowerCase()));

      const ranked = dedupeNewsEvents(newsRows)
        .map((event) => {
          const bucket = classifyNewsBucket(event);
          const tags = Array.isArray(event.tags) ? event.tags.map((t) => String(t).toLowerCase()) : [];
          if (tags.some((t) => excluded.has(t))) return null;
          const score = scoreCapitalRelevance({ event, bucket, profile, preferred, regimeState });
          return { event, bucket, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, DAILY_BRIEF_HARD_CAP_BULLETS);

      const ideal = ranked.slice(0, DAILY_BRIEF_IDEAL_BULLETS);
      const extras = ranked
        .slice(DAILY_BRIEF_IDEAL_BULLETS)
        .filter((x) => Number(x.score) >= EXTRA_BRIEF_RELEVANCE_THRESHOLD)
        .slice(0, Math.max(0, DAILY_BRIEF_HARD_CAP_BULLETS - DAILY_BRIEF_IDEAL_BULLETS));
      const finalBullets = [...ideal, ...extras].map((item) => formatCapitalBriefBullet({ event: item.event, bucket: item.bucket, regimeState }));

      await query(
        `INSERT INTO daily_digest (
          user_id, date, bullets, regime_summary, crisis_banner, themes, risk_flags, raw_structured, updated_at
        ) VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,NOW())
        ON CONFLICT (user_id, date)
        DO UPDATE SET
          bullets = EXCLUDED.bullets,
          regime_summary = EXCLUDED.regime_summary,
          crisis_banner = EXCLUDED.crisis_banner,
          themes = EXCLUDED.themes,
          risk_flags = EXCLUDED.risk_flags,
          raw_structured = EXCLUDED.raw_structured,
          updated_at = NOW()`,
        [
          user.id,
          date,
          JSON.stringify(finalBullets),
          summarizeRegime(regimeState.regime, regimeState.confidence),
          JSON.stringify(toCrisisBanner(crisisState)),
          JSON.stringify(regimeState.leadership || []),
          JSON.stringify(regimeState.riskFlags || []),
          JSON.stringify({ pipeline: ['ingest', 'dedupe', 'rank', 'select_top_5'], pickedNewsIds: ranked.map((x) => x.event.id), profile })
        ]
      );
    }

    return { users: usersOut.rows.length, sourceNews: newsRows.length };
  };

  const runDaily = async ({ date = null } = {}) =>
    withTrackedJobRun({
      query,
      jobName: 'mvp_daily',
      date,
      run: async (runDateInput) => {
        const runDate = date ? String(runDateInput) : await resolveRunDate(null);
        const regimeState = await runRegimeDaily(runDate);
        const crisisState = await runCrisisModeCheck(runDate, regimeState);
        const recommendations = await runRecommendationsDaily(runDate, regimeState, crisisState, regimeState.metricsRows || []);
        const digest = await runNewsDigestDaily(runDate, regimeState, crisisState);

        logger.log('[mvp-daily] complete', {
          date: runDate,
          regime: regimeState.regime,
          volatility: regimeState.volatilityRegime,
          crisis: crisisState.isActive,
          baseIdeas: recommendations.baseIdeas,
          recommendationUsers: recommendations.users,
          digestUsers: digest.users,
          sourceNews: digest.sourceNews
        });

        return {
          generated: recommendations.users + digest.users,
          date: runDate,
          regime: regimeState.regime,
          volatilityRegime: regimeState.volatilityRegime,
          crisisActive: crisisState.isActive,
          baseIdeas: recommendations.baseIdeas,
          recommendationUsers: recommendations.users,
          digestUsers: digest.users,
          sourceNews: digest.sourceNews
        };
      }
    });

  return {
    runDaily,
    runRegimeDaily,
    runCrisisModeCheck,
    runRecommendationsDaily,
    runNewsDigestDaily,
    buildRegimeFromMetrics
  };
};

module.exports = { createMvpDailyPipeline, buildRegimeFromMetrics };
