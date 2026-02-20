const { computeProfileMix } = require('./profileFocus');

const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const isoDate = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

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

const buildRegimeFromMetrics = (rows = []) => {
  const bySymbol = new Map();
  for (const row of rows) bySymbol.set(String(row.symbol || '').toUpperCase(), row);

  const spy = bySymbol.get('SPY') || {};
  const qqq = bySymbol.get('QQQ') || {};
  const iwm = bySymbol.get('IWM') || {};
  const hyg = bySymbol.get('HYG') || {};
  const ief = bySymbol.get('IEF') || {};
  const tlt = bySymbol.get('TLT') || {};

  const spyRet1m = toNum(spy.ret_1m);
  const qqqRet1m = toNum(qqq.ret_1m);
  const iwmRet1m = toNum(iwm.ret_1m);
  const hygRet1m = toNum(hyg.ret_1m);
  const iefRet1m = toNum(ief.ret_1m);
  const tltRet1m = toNum(tlt.ret_1m);
  const spyVol20d = toNum(spy.vol_20d);

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
  if (spyVol20d >= 0.035 || toNum(spy.ret_1d) <= -0.03) volatilityRegime = 'crisis';
  else if (spyVol20d >= 0.025) volatilityRegime = 'elevated';

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
    confidence
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

const createMvpDailyPipeline = ({ query, logger = console }) => {
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

  const runRegimeDaily = async (date) => {
    const metricsRows = await loadMetricsUniverse(date);
    const regime = buildRegimeFromMetrics(metricsRows);

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
        JSON.stringify(regime.macroDrivers),
        JSON.stringify(regime.riskFlags),
        regime.confidence
      ]
    );

    return { ...regime, metricsRows };
  };

  const runCrisisModeCheck = async (date, regimeState) => {
    const highImpactFromFlags = (regimeState.riskFlags || []).some((flag) => /shock|stress|credit|crisis/i.test(String(flag)));
    const isActive = regimeState.volatilityRegime === 'crisis' || (regimeState.volatilityRegime === 'elevated' && highImpactFromFlags);
    const triggers = [];
    if (regimeState.volatilityRegime === 'crisis') triggers.push('volatility_regime=crisis');
    if (regimeState.volatilityRegime === 'elevated') triggers.push('volatility_regime=elevated');
    if (highImpactFromFlags) triggers.push('high_impact_event_flag');

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
        JSON.stringify({ triggers, changedPolicy: isActive })
      ]
    );

    return { isActive, triggers, summary };
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
      const focus = clamp01(profile.focus);
      const riskLevel = clamp01(profile.risk_level);
      const mix = computeProfileMix(focus);

      const minConfidence = clamp01(0.45 + (1 - riskLevel) * 0.2 + (crisisState.isActive ? 0.1 : 0));
      const strategicCap = crisisState.isActive ? 3 : 4;
      const opportunisticCap = Math.min(3, crisisState.isActive ? 1 : 3);
      const riskCap = crisisState.isActive ? 4 : riskLevel < 0.4 ? 4 : 3;

      const strategicCount = Math.max(1, Math.round(strategicCap * mix.strategicRatio));
      const opportunisticCount = Math.max(0, Math.min(opportunisticCap, Math.round(opportunisticCap * mix.opportunisticRatio + 0.2)));

      const strategic = strategicIdeas.filter((x) => x.confidence >= minConfidence).slice(0, strategicCount);
      const opportunistic = opportunisticIdeas
        .filter((x) => x.confidence >= Math.max(0.35, minConfidence - 0.08))
        .slice(0, opportunisticCount);
      const riskAlerts = riskIdeas.slice(0, riskCap);

      const ordered = crisisState.isActive
        ? [...riskAlerts, ...strategic, ...opportunistic]
        : [...strategic, ...opportunistic, ...riskAlerts];

      await query(
        `INSERT INTO user_recommendations (user_id, date, items, updated_at)
         VALUES ($1,$2,$3::jsonb,NOW())
         ON CONFLICT (user_id, date)
         DO UPDATE SET items = EXCLUDED.items, updated_at = NOW()`,
        [user.id, date, JSON.stringify(ordered)]
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

      const ranked = newsRows
        .map((item) => {
          const bucket = classifyNewsBucket(item);
          const tags = Array.isArray(item.tags) ? item.tags.map((t) => String(t).toLowerCase()) : [];
          if (tags.some((t) => excluded.has(t))) return null;
          let score = bucket === 'macro' ? 4 : bucket === 'risk' ? 3.5 : bucket === 'company' ? 2.5 : 2;
          if (tags.some((t) => preferred.has(t))) score += 1.5;
          score += (toNum(profile.focus) - 0.5) * (bucket === 'macro' ? 1 : -0.5);
          score += (0.5 - toNum(profile.risk_level)) * (bucket === 'risk' ? 0.8 : 0);
          return { ...item, bucket, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      const bullets = [];
      bullets.push(summarizeRegime(regimeState.regime, regimeState.confidence));
      bullets.push(`Leadership/themes: ${(regimeState.leadership || []).join(', ') || 'sin liderazgo claro'}.`);
      bullets.push(`Key risks: ${(regimeState.riskFlags || []).slice(0, 2).join('; ') || 'sin flags críticos'}.`);

      for (const item of ranked) {
        const prefix = item.bucket === 'macro' ? 'Macro' : item.bucket === 'risk' ? 'Risk' : item.bucket === 'company' ? 'Company' : 'Sector';
        bullets.push(`${prefix}: ${String(item.headline || '').trim()}`.slice(0, 180));
        if (bullets.length >= 10) break;
      }

      const finalBullets = bullets.slice(0, 10);

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
          JSON.stringify({ pickedNewsIds: ranked.map((x) => x.id), profile })
        ]
      );
    }

    return { users: usersOut.rows.length, sourceNews: newsRows.length };
  };

  const runDaily = async ({ date = null } = {}) => {
    const runDate = await resolveRunDate(date);
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
  };

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
