const { query } = require('../config/db');
const { withTrackedJobRun } = require('../services/jobRunTracker');

const runCore = async () => {
  const out = await query(
    `SELECT regime, volatility_regime, risk_flags
     FROM regime_state
     WHERE COALESCE(state_date, date) = CURRENT_DATE
     LIMIT 1`
  );

  const regime = out.rows?.[0] || {};
  const isActive = String(regime.volatility_regime || '').toLowerCase() === 'crisis';
  const triggers = isActive ? ['volatility_regime=crisis', ...(Array.isArray(regime.risk_flags) ? regime.risk_flags : [])] : [];
  const whatChanged = isActive
    ? ['Risk alerts prioritized', 'Fewer speculative ideas']
    : [];
  const title = isActive ? 'Elevated Market Volatility' : null;
  const summary = isActive ? 'VIX proxy above crisis threshold and risk conditions deteriorated.' : null;

  await query(
    `INSERT INTO crisis_state (
      state_date, date, is_active, title, summary, triggers, what_changed, activated_at, computed_at, learn_more, last_updated_at
    )
     VALUES (
      CURRENT_DATE, CURRENT_DATE, $1, $2, $3, $4::jsonb, $5::jsonb, CASE WHEN $1 THEN NOW() ELSE NULL END, NOW(),
      $6::jsonb, NOW()
    )
     ON CONFLICT (state_date) DO UPDATE SET
      date = EXCLUDED.date,
      is_active = EXCLUDED.is_active,
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      triggers = EXCLUDED.triggers,
      what_changed = EXCLUDED.what_changed,
      activated_at = CASE
        WHEN crisis_state.is_active = FALSE AND EXCLUDED.is_active = TRUE THEN NOW()
        WHEN EXCLUDED.is_active = TRUE THEN COALESCE(crisis_state.activated_at, NOW())
        ELSE NULL
      END,
      computed_at = NOW(),
      learn_more = EXCLUDED.learn_more,
      last_updated_at = NOW()`,
    [
      isActive,
      title,
      summary,
      JSON.stringify(triggers),
      JSON.stringify(whatChanged),
      JSON.stringify({ triggers, whatChanged })
    ]
  );

  return { is_active: isActive, title, summary };
};

const run = async () =>
  withTrackedJobRun({
    query,
    jobName: 'crisis_check',
    run: runCore
  });

module.exports = { run, runCore };
