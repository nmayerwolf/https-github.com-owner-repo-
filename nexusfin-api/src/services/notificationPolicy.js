const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const isoDate = (date = new Date()) => new Date(date).toISOString().slice(0, 10);

const asArray = (value) => (Array.isArray(value) ? value : []);

const pickTop = (items = [], predicate, limit = 1) =>
  asArray(items)
    .filter(predicate)
    .sort((a, b) => toNum(b.confidence) - toNum(a.confidence))
    .slice(0, limit);

const parseItems = (row) => asArray(row?.items).map((item) => ({ ...item }));

const isCriticalRisk = (item = {}) => {
  if (String(item.category || '').toLowerCase() !== 'risk') return false;
  const sev = String(item.severity || '').toLowerCase();
  const conf = toNum(item.confidence);
  return sev === 'high' || conf >= 0.85;
};

const isHighStrategic = (item = {}) =>
  String(item.category || '').toLowerCase() === 'strategic' && toNum(item.confidence) >= 0.85;

const isHighDislocation = (item = {}) => {
  if (String(item.category || '').toLowerCase() !== 'opportunistic') return false;
  const conf = toNum(item.confidence);
  const typ = String(item.opportunisticType || item.opportunistic_type || '').toLowerCase();
  return conf >= 0.9 && ['value_dislocation', 'overreaction', 'macro_divergence'].includes(typ);
};

const buildEvent = ({ date, type, title, body, data }) => ({
  eventKey: `${date}:${type}:${String(data?.ideaId || data?.symbol || 'global')}`,
  title,
  body,
  data: { type, ...data }
});

const buildDigestBody = ({ crisisActive, regime, riskCount, strategicCount, opportunisticCount }) => {
  if (crisisActive) {
    return `High Volatility Update: ${riskCount} risk alerts críticos, ${opportunisticCount} dislocaciones de alta convicción, régimen ${regime}.`;
  }
  return `Daily Macro Digest: régimen ${regime}, ${strategicCount} ideas estratégicas, ${riskCount} alertas de riesgo.`;
};

const selectPolicyEvents = ({
  date,
  crisisActive = false,
  regime = 'transition',
  prevRegime = null,
  items = [],
  notificationMode = 'normal'
}) => {
  const safeItems = asArray(items);
  const events = [];

  const criticalRisks = pickTop(safeItems, isCriticalRisk, crisisActive ? 2 : 1);
  const highStrategic = pickTop(safeItems, isHighStrategic, 1);
  const highDislocation = pickTop(safeItems, isHighDislocation, 1);

  if (notificationMode === 'digest_only') {
    events.push(
      buildEvent({
        date,
        type: crisisActive ? 'crisis_digest' : 'daily_digest',
        title: crisisActive ? 'High Volatility Update' : 'Daily Market Digest',
        body: buildDigestBody({
          crisisActive,
          regime,
          riskCount: criticalRisks.length,
          strategicCount: pickTop(safeItems, isHighStrategic, 99).length,
          opportunisticCount: pickTop(safeItems, (x) => String(x.category || '').toLowerCase() === 'opportunistic', 99).length
        }),
        data: {
          regime,
          crisisActive,
          riskCount: criticalRisks.length,
          strategicCount: pickTop(safeItems, isHighStrategic, 99).length
        }
      })
    );
    return events;
  }

  if (prevRegime && prevRegime !== regime) {
    events.push(
      buildEvent({
        date,
        type: 'regime_shift',
        title: 'Regime Shift Detected',
        body: `Cambio de régimen: ${prevRegime} -> ${regime}. Revisá cobertura y exposición.`,
        data: { prevRegime, regime }
      })
    );
  }

  if (crisisActive) {
    for (const risk of criticalRisks) {
      events.push(
        buildEvent({
          date,
          type: 'critical_risk',
          title: 'Critical Risk Alert',
          body: `${risk.rationale?.[0] || 'Riesgo crítico detectado en entorno de crisis.'}`.slice(0, 180),
          data: { ideaId: risk.ideaId, symbol: risk.symbol || null, confidence: toNum(risk.confidence) }
        })
      );
    }

    if (highDislocation[0]) {
      const idea = highDislocation[0];
      events.push(
        buildEvent({
          date,
          type: 'high_conviction_dislocation',
          title: 'High Conviction Dislocation',
          body: `${idea.symbol || 'Asset'}: setup oportunístico de alta convicción (${Math.round(toNum(idea.confidence) * 100)}%).`,
          data: { ideaId: idea.ideaId, symbol: idea.symbol || null, confidence: toNum(idea.confidence) }
        })
      );
    }

    return events;
  }

  if (criticalRisks[0]) {
    const idea = criticalRisks[0];
    events.push(
      buildEvent({
        date,
        type: 'risk_alert',
        title: 'Risk Alert',
        body: `${idea.rationale?.[0] || 'Riesgo relevante detectado.'}`.slice(0, 180),
        data: { ideaId: idea.ideaId, symbol: idea.symbol || null, confidence: toNum(idea.confidence) }
      })
    );
  }

  if (highStrategic[0]) {
    const idea = highStrategic[0];
    events.push(
      buildEvent({
        date,
        type: 'strategic_idea',
        title: 'High Confidence Strategic Idea',
        body: `${idea.symbol || 'Asset'} ${idea.action || 'WATCH'} (${Math.round(toNum(idea.confidence) * 100)}% conf).`,
        data: { ideaId: idea.ideaId, symbol: idea.symbol || null, confidence: toNum(idea.confidence) }
      })
    );
  }

  return events;
};

const createNotificationPolicyService = ({ query, pushNotifier, logger = console }) => {
  const ensureNotificationLog = async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS notification_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_date DATE NOT NULL,
        event_key TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, event_key)
      )
    `);
  };

  const loadDateContext = async (date) => {
    const [regimeOut, prevRegimeOut, crisisOut] = await Promise.all([
      query('SELECT regime FROM regime_state WHERE date = $1 LIMIT 1', [date]),
      query('SELECT regime FROM regime_state WHERE date < $1 ORDER BY date DESC LIMIT 1', [date]),
      query('SELECT is_active FROM crisis_state WHERE date = $1 LIMIT 1', [date])
    ]);

    return {
      regime: String(regimeOut.rows?.[0]?.regime || 'transition'),
      prevRegime: prevRegimeOut.rows?.[0]?.regime || null,
      crisisActive: Boolean(crisisOut.rows?.[0]?.is_active)
    };
  };

  const runDaily = async ({ date = null } = {}) => {
    if (!pushNotifier?.notifySystem) {
      return { sent: 0, usersScanned: 0, skipped: 'PUSH_NOTIFIER_UNAVAILABLE' };
    }

    await ensureNotificationLog();

    const runDate = isoDate(date || new Date());
    const context = await loadDateContext(runDate);
    const usersOut = await query('SELECT id FROM users ORDER BY created_at ASC');

    let usersScanned = 0;
    let sent = 0;

    for (const user of usersOut.rows || []) {
      usersScanned += 1;
      try {
        const [profileOut, recoOut] = await Promise.all([
          query('SELECT notification_mode FROM user_agent_profile WHERE user_id = $1 LIMIT 1', [user.id]),
          query('SELECT items FROM user_recommendations WHERE user_id = $1 AND date = $2 LIMIT 1', [user.id, runDate])
        ]);

        const notificationMode = String(profileOut.rows?.[0]?.notification_mode || 'normal').toLowerCase();
        const items = parseItems(recoOut.rows?.[0] || {});

        const events = selectPolicyEvents({
          date: runDate,
          crisisActive: context.crisisActive,
          regime: context.regime,
          prevRegime: context.prevRegime,
          items,
          notificationMode
        });

        for (const event of events) {
          const lock = await query(
            `INSERT INTO notification_events (user_id, event_date, event_key, payload)
             VALUES ($1,$2,$3,$4::jsonb)
             ON CONFLICT (user_id, event_key) DO NOTHING
             RETURNING id`,
            [user.id, runDate, event.eventKey, JSON.stringify(event)]
          );

          if (!lock.rows.length) continue;

          const out = await pushNotifier.notifySystem({
            userId: user.id,
            title: event.title,
            body: event.body,
            data: event.data,
            respectQuietHours: true
          });

          sent += Number(out?.sent || 0);
        }
      } catch (error) {
        logger.warn?.(`[notificationPolicy] failed for ${user.id}`, error?.message || error);
      }
    }

    return {
      date: runDate,
      usersScanned,
      sent,
      crisisActive: context.crisisActive,
      regime: context.regime
    };
  };

  return { runDaily };
};

module.exports = {
  createNotificationPolicyService,
  selectPolicyEvents,
  isCriticalRisk,
  isHighStrategic,
  isHighDislocation
};
