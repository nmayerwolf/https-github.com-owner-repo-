const { query } = require('../config/db');
const { withTrackedJobRun } = require('../services/jobRunTracker');
const { selectCandidates, generateIdeas } = require('../engines/ideasEngine');
const { logAiUsage } = require('../services/aiUsageLogger');

const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const normalizeIdea = (row = {}, index = 0, runDate = '') => {
  const category = String(row.category || '').toLowerCase();
  const symbol = String(row.symbol || '').toUpperCase() || null;
  const ideaId = String(row.ideaId || row.idea_id || `${category || 'idea'}-${symbol || 'market'}-${index + 1}-${runDate}`);
  if (category === 'risk') {
    return {
      ideaId,
      category: 'risk',
      severity: ['low', 'medium', 'high'].includes(String(row.severity || '').toLowerCase()) ? String(row.severity).toLowerCase() : 'medium',
      title: String(row.title || `${symbol || 'Market'} risk`).slice(0, 140),
      bullets: (Array.isArray(row.bullets) ? row.bullets : row.rationale || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3),
      tags: (Array.isArray(row.tags) ? row.tags : []).map((x) => String(x || '').toLowerCase()).slice(0, 8)
    };
  }

  return {
    ideaId,
    category: category === 'opportunistic' ? 'opportunistic' : 'strategic',
    symbol,
    action: ['BUY', 'SELL', 'WATCH'].includes(String(row.action || '').toUpperCase()) ? String(row.action || '').toUpperCase() : 'WATCH',
    confidence: clamp01(row.confidence),
    timeframe: String(row.timeframe || 'weeks').toLowerCase() === 'months' ? 'months' : 'weeks',
    invalidation: String(row.invalidation || '').trim().slice(0, 180) || 'Invalidation not provided',
    rationale: (Array.isArray(row.rationale) ? row.rationale : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3),
    risks: (Array.isArray(row.risks) ? row.risks : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 2),
    tags: (Array.isArray(row.tags) ? row.tags : []).map((x) => String(x || '').toLowerCase()).slice(0, 8),
    opportunistic_type: row.opportunistic_type || row.opportunisticType || null
  };
};

const splitIdeas = (ideas = []) => ({
  strategic: ideas.filter((x) => x.category === 'strategic'),
  opportunistic: ideas.filter((x) => x.category === 'opportunistic'),
  risk: ideas.filter((x) => x.category === 'risk')
});

const runCore = async (runDate) => {
  const [regimeOut, crisisOut, metricsOut, barsOut] = await Promise.all([
    query(
      `SELECT regime, volatility_regime, leadership, macro_drivers, risk_flags, confidence
       FROM regime_state
       WHERE COALESCE(state_date, date) = $1
       LIMIT 1`,
      [runDate]
    ),
    query(
      `SELECT is_active
       FROM crisis_state
       WHERE COALESCE(state_date, date) = $1
       LIMIT 1`,
      [runDate]
    ),
    query(
      `SELECT symbol, rsi_14, relative_strength, volatility_20d, sma_50, sma_200, ma50, vol_20d
       FROM market_metrics_daily
       WHERE COALESCE(metric_date, date) = $1`,
      [runDate]
    ),
    query(
      `SELECT symbol, close, change_pct
       FROM market_daily_bars
       WHERE COALESCE(bar_date, date) = $1`,
      [runDate]
    )
  ]);

  const regimeState = regimeOut.rows?.[0] || { regime: 'transition', volatility_regime: 'normal', leadership: [], risk_flags: [], confidence: 0.5 };
  const crisisActive = Boolean(crisisOut.rows?.[0]?.is_active);
  const candidates = await selectCandidates(regimeState, metricsOut.rows || [], barsOut.rows || []);
  const aiResult = await generateIdeas(candidates, regimeState);
  const normalizedIdeas = (Array.isArray(aiResult.ideas) ? aiResult.ideas : []).map((row, index) => normalizeIdea(row, index, runDate));
  const sections = splitIdeas(normalizedIdeas);

  await query('DELETE FROM base_ideas WHERE COALESCE(date, idea_date) = $1', [runDate]);
  for (const item of normalizedIdeas) {
    if (item.category === 'risk') {
      await query(
        `INSERT INTO base_ideas (
          date, idea_id, category, action, confidence, timeframe, invalidation, rationale, risks, tags, severity, raw_scores, created_at
        ) VALUES ($1,$2,'risk','WATCH',NULL,'weeks',NULL,$3::jsonb,'[]'::jsonb,$4::jsonb,$5,$6::jsonb,NOW())`,
        [runDate, item.ideaId, JSON.stringify(item.bullets || []), JSON.stringify(item.tags || []), item.severity, JSON.stringify({ title: item.title })]
      );
    } else {
      await query(
        `INSERT INTO base_ideas (
          date, idea_id, category, symbol, action, confidence, timeframe, invalidation,
          rationale, risks, tags, opportunistic_type, raw_scores, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb,NOW())`,
        [
          runDate,
          item.ideaId,
          item.category,
          item.symbol,
          item.action,
          item.confidence,
          item.timeframe,
          item.invalidation,
          JSON.stringify(item.rationale || []),
          JSON.stringify(item.risks || []),
          JSON.stringify(item.tags || []),
          item.opportunistic_type,
          JSON.stringify({})
        ]
      );
    }
  }

  const usersOut = await query(
    `SELECT u.id, p.focus, p.risk_level, p.horizon
     FROM users u
     LEFT JOIN user_agent_profile p ON p.user_id = u.id
     ORDER BY u.created_at ASC`
  );

  let generated = 0;
  for (const user of usersOut.rows || []) {
    const focus = toNum(user.focus, 0.5);
    const riskLevel = toNum(user.risk_level, 0.5);
    let minConfidence = 0.45;
    if (riskLevel < 0.3) minConfidence += 0.1;
    if (crisisActive) minConfidence += 0.1;

    let strategicCap = 4;
    let opportunisticCap = 3;
    let riskCap = 4;
    if (focus > 0.7) strategicCap = 2;
    if (focus < 0.3) opportunisticCap = 1;

    if (crisisActive) {
      strategicCap = Math.min(strategicCap, 2);
      opportunisticCap = Math.min(opportunisticCap, 1);
    }

    const strategic = sections.strategic
      .filter((x) => x.confidence >= minConfidence)
      .slice(0, strategicCap)
      .map((x) => ({ ...x, tags: [...new Set([...(x.tags || []), ...(crisisActive ? ['crisis_mode'] : [])])] }));
    const opportunistic = sections.opportunistic
      .filter((x) => x.confidence >= minConfidence)
      .slice(0, opportunisticCap)
      .map((x) => ({ ...x, tags: [...new Set([...(x.tags || []), ...(crisisActive ? ['crisis_mode'] : [])])] }));
    const riskAlerts = sections.risk.slice(0, riskCap).map((x) => ({ ...x, tags: [...new Set([...(x.tags || []), ...(crisisActive ? ['crisis_mode'] : [])])] }));
    const ordered = [...strategic, ...opportunistic, ...riskAlerts];

    await query(
      `INSERT INTO user_recommendations (user_id, date, items, updated_at)
       VALUES ($1,$2,$3::jsonb,NOW())
       ON CONFLICT (user_id, date)
       DO UPDATE SET
         items = EXCLUDED.items,
         updated_at = NOW()`,
      [user.id, runDate, JSON.stringify(ordered)]
    );
    generated += 1;
  }

  await logAiUsage({
    query,
    userId: null,
    feature: 'ideas_generation',
    model: aiResult.model,
    usage: aiResult.usage,
    success: aiResult.mode === 'ai',
    durationMs: aiResult.durationMs || 0
  });

  return {
    generated,
    users: generated,
    strategic: sections.strategic.length,
    opportunistic: sections.opportunistic.length,
    riskAlerts: sections.risk.length
  };
};

const run = async () =>
  withTrackedJobRun({
    query,
    jobName: 'recommendations_daily',
    run: runCore
  });

module.exports = { run, runCore, normalizeIdea };
