const { randomUUID } = require('crypto');

const ART_TZ = 'America/Argentina/Buenos_Aires';

const artDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ART_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const toNum = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const safeQuery = async (query, sql, params = [], fallback = { rows: [] }) => {
  try {
    return await query(sql, params);
  } catch {
    return fallback;
  }
};

const createRegimeEngine = ({ query, logger = console, modelVersion = 'regime-v1' }) => {
  const computeDailyRegime = async ({ date } = {}) => {
    const runDate = date || artDate();

    const [vixObs, hyObs, trendObs] = await Promise.all([
      safeQuery(query, `SELECT value FROM macro_observations WHERE series_id = 'VIXCLS' AND date <= $1 ORDER BY date DESC LIMIT 1`, [runDate]),
      safeQuery(query, `SELECT value FROM macro_observations WHERE series_id = 'BAMLH0A0HYM2' AND date <= $1 ORDER BY date DESC LIMIT 1`, [runDate]),
      safeQuery(
        query,
        `SELECT f.ret_1m AS value
         FROM daily_features_theme f
         JOIN themes t ON t.theme_id = f.theme_id
         WHERE f.date <= $1
         ORDER BY f.date DESC, t.tier ASC
         LIMIT 1`,
        [runDate]
      )
    ]);

    const vix = toNum(vixObs.rows?.[0]?.value, 18);
    const hy = toNum(hyObs.rows?.[0]?.value, 350);
    const trend = toNum(trendObs.rows?.[0]?.value, 0.02);

    let regimeState = 'TRANSITION';
    if (vix >= 28 || hy >= 550 || trend < -0.05) regimeState = 'STRESS';
    else if (vix <= 18 && hy <= 420 && trend > 0) regimeState = 'EXPANSION';

    const confidence = Math.max(45, Math.min(95, Math.round(100 - Math.abs(vix - 20) - Math.max(0, (hy - 350) / 7))));
    const changeRisk = Math.max(5, Math.min(90, Math.round((Math.abs(vix - 20) * 2 + Math.max(0, hy - 400) / 3) / 2)));

    const numbers = [
      { label: 'VIX', value: vix, unit: 'pts', sourceRef: 'VIXCLS' },
      { label: 'High Yield Spread', value: hy, unit: 'bps', sourceRef: 'BAMLH0A0HYM2' },
      { label: 'Theme Trend 1M', value: trend * 100, unit: '%', sourceRef: 'daily_features_theme.ret_1m' }
    ];

    const narrative =
      regimeState === 'STRESS'
        ? 'Vemos señales de estrés y priorizamos preservación de capital hasta que baje la fricción de riesgo.'
        : regimeState === 'EXPANSION'
          ? 'Vemos un entorno constructivo con amplitud saludable y mejor balance riesgo/retorno.'
          : 'Vemos un régimen de transición: el sesgo es selectivo y disciplinado mientras se define la dirección macro.';

    await safeQuery(
      query,
      `INSERT INTO daily_regime (date, regime_state, confidence, change_risk, narrative, numbers_json, model_version, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW())
       ON CONFLICT (date)
       DO UPDATE SET regime_state = EXCLUDED.regime_state,
                     confidence = EXCLUDED.confidence,
                     change_risk = EXCLUDED.change_risk,
                     narrative = EXCLUDED.narrative,
                     numbers_json = EXCLUDED.numbers_json,
                     model_version = EXCLUDED.model_version,
                     computed_at = NOW()`,
      [runDate, regimeState, confidence, changeRisk, narrative, JSON.stringify(numbers), modelVersion]
    );

    const signals = [
      { key: 'trend', value: trend, score: Math.round(Math.max(0, Math.min(100, 50 + trend * 400))) },
      { key: 'vix', value: vix, score: Math.round(Math.max(0, Math.min(100, 100 - vix * 3))) },
      { key: 'credit', value: hy, score: Math.round(Math.max(0, Math.min(100, 100 - (hy - 300) / 4))) },
      { key: 'breadth', value: trend, score: Math.round(Math.max(0, Math.min(100, 48 + trend * 350))) }
    ];

    await Promise.all(
      signals.map((signal) =>
        safeQuery(
          query,
          `INSERT INTO daily_regime_signals (date, signal_key, value, normalized_score, source_ref, computed_at)
           VALUES ($1,$2,$3,$4,$5,NOW())
           ON CONFLICT (date, signal_key)
           DO UPDATE SET value = EXCLUDED.value,
                         normalized_score = EXCLUDED.normalized_score,
                         source_ref = EXCLUDED.source_ref,
                         computed_at = NOW()`,
          [runDate, signal.key, signal.value, signal.score, signal.key]
        )
      )
    );

    return {
      id: randomUUID(),
      date: runDate,
      state: regimeState,
      confidence,
      changeRisk,
      narrative,
      numbers,
      modelVersion
    };
  };

  const getSnapshot = async ({ date } = {}) => {
    const runDate = date || artDate();
    const out = await safeQuery(
      query,
      `SELECT date::text AS date, regime_state, confidence, change_risk, narrative, numbers_json, model_version
       FROM daily_regime
       WHERE date = $1
       LIMIT 1`,
      [runDate]
    );

    const row = out.rows?.[0];
    if (!row) {
      return computeDailyRegime({ date: runDate });
    }

    return {
      date: row.date,
      state: row.regime_state,
      confidence: Number(row.confidence || 0),
      changeRisk: row.change_risk != null ? Number(row.change_risk) : null,
      narrative: String(row.narrative || ''),
      numbers: Array.isArray(row.numbers_json) ? row.numbers_json : [],
      modelVersion: String(row.model_version || modelVersion)
    };
  };

  return { computeDailyRegime, getSnapshot, artDate };
};

module.exports = { createRegimeEngine };
