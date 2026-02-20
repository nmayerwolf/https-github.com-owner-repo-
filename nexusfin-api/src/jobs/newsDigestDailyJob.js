const { query } = require('../config/db');
const { withTrackedJobRun } = require('../services/jobRunTracker');
const { generateDigest } = require('../engines/digestEngine');
const { logAiUsage } = require('../services/aiUsageLogger');

const runCore = async (runDate) => {
  const [regimeOut, crisisOut, newsOut, usersOut] = await Promise.all([
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
      `SELECT headline, source, ts, tags
       FROM news_items
       WHERE ts >= $1::date
         AND ts < ($1::date + INTERVAL '1 day')
       ORDER BY ts DESC
       LIMIT 100`,
      [runDate]
    ),
    query(
      `SELECT u.id, p.focus, p.risk_level, p.horizon, p.language
       FROM users u
       LEFT JOIN user_agent_profile p ON p.user_id = u.id
       ORDER BY u.created_at ASC`
    )
  ]);

  const regimeState = regimeOut.rows?.[0] || { regime: 'transition', volatility_regime: 'normal', leadership: [], macro_drivers: [], risk_flags: [], confidence: 0.5 };
  const crisisState = crisisOut.rows?.[0] || { is_active: false };
  const newsHeadlines = (newsOut.rows || []).map((row) => ({
    headline: String(row.headline || '').trim(),
    category: Array.isArray(row.tags) && row.tags.length ? String(row.tags[0]) : 'general'
  }));

  let generated = 0;
  for (const user of usersOut.rows || []) {
    const userProfile = {
      focus: Number(user.focus || 0.5),
      risk_level: Number(user.risk_level || 0.5),
      horizon: Number(user.horizon || 0.5),
      language: String(user.language || 'es').toLowerCase() === 'en' ? 'en' : 'es'
    };
    const aiResult = await generateDigest(regimeState, crisisState, newsHeadlines, userProfile);
    const digest = aiResult.digest || { bullets: [], key_risks: [], macro_drivers: [] };

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
        runDate,
        JSON.stringify(digest.bullets || []),
        `${regimeState.regime} (${regimeState.volatility_regime})`,
        JSON.stringify({ isActive: Boolean(crisisState.is_active) }),
        JSON.stringify(regimeState.leadership || []),
        JSON.stringify(digest.key_risks || regimeState.risk_flags || []),
        JSON.stringify({
          key_risks: digest.key_risks || [],
          macro_drivers: digest.macro_drivers || [],
          regime: regimeState.regime,
          volatility_regime: regimeState.volatility_regime,
          confidence: regimeState.confidence,
          crisis_active: Boolean(crisisState.is_active)
        })
      ]
    );

    await logAiUsage({
      query,
      userId: user.id,
      feature: 'news_digest',
      model: aiResult.model,
      usage: aiResult.usage,
      success: aiResult.mode === 'ai',
      durationMs: aiResult.durationMs || 0
    });

    generated += 1;
  }

  return { generated, users: generated };
};

const run = async () =>
  withTrackedJobRun({
    query,
    jobName: 'news_digest_daily',
    run: runCore
  });

module.exports = { run, runCore };
