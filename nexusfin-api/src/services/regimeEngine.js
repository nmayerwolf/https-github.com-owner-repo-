const ART_TZ = 'America/Argentina/Buenos_Aires';

const artDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ART_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const safeQuery = async (query, sql, params = [], fallback = { rows: [] }) => {
  try {
    return await query(sql, params);
  } catch {
    return fallback;
  }
};

const toNum = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const MATERIAL_DELTA_THRESHOLD = 6;

const createRegimeEngine = ({ query, logger = console, modelVersion = 'regime-v1' }) => {
  const getLatestMarketSignals = async (runDate) => {
    const out = await safeQuery(
      query,
      `SELECT asset_id, last, change_pct
       FROM market_snapshots
       WHERE ts::date <= $1::date
       ORDER BY ts DESC
       LIMIT 250`,
      [runDate]
    );

    const rows = out.rows || [];
    const avgMove = rows.length
      ? rows.reduce((acc, row) => acc + Math.abs(toNum(row.change_pct, 0)), 0) / rows.length
      : null;

    return {
      coverage: rows.length,
      avgAbsMovePct: avgMove
    };
  };

  const hasMaterialThemeDelta = async (runDate) => {
    const out = await safeQuery(
      query,
      `WITH latest AS (
         SELECT theme_id, score
         FROM daily_theme_scores
         WHERE date = $1::date
         ORDER BY score DESC
         LIMIT 10
       ),
       prev_date AS (
         SELECT MAX(date) AS date
         FROM daily_theme_scores
         WHERE date < $1::date
       ),
       prev AS (
         SELECT t.theme_id, t.score
         FROM daily_theme_scores t
         JOIN prev_date p ON p.date = t.date
       )
       SELECT l.theme_id,
              l.score AS latest_score,
              p.score AS prev_score
       FROM latest l
       LEFT JOIN prev p ON p.theme_id = l.theme_id`,
      [runDate]
    );

    const rows = out.rows || [];
    if (!rows.length) return false;

    let totalWeightedDelta = 0;
    let totalWeight = 0;
    let rank = 0;

    for (const row of rows) {
      rank += 1;
      const prev = toNum(row.prev_score, null);
      const latest = toNum(row.latest_score, null);
      if (prev == null || latest == null) continue; // Missing metrics -> rule not triggered
      const weight = Math.max(1, 11 - rank);
      totalWeightedDelta += Math.abs(latest - prev) * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return false;
    const weightedDelta = totalWeightedDelta / totalWeight;
    return weightedDelta >= MATERIAL_DELTA_THRESHOLD;
  };

  const classify = (signals) => {
    const avgMove = toNum(signals.avgAbsMovePct, 0);
    const coverage = toNum(signals.coverage, 0);

    let label = 'Neutral';
    if (coverage >= 20 && avgMove >= 2.2) label = 'Risk-Off';
    else if (coverage >= 20 && avgMove <= 0.8) label = 'Risk-On';

    const confidence = Math.max(35, Math.min(92, Math.round(48 + coverage / 4 + (2.5 - Math.min(avgMove, 2.5)) * 12)));
    const narrative =
      label === 'Risk-Off'
        ? 'El mercado muestra mayor fricción: priorizamos selectividad, control de riesgo y confirmación de tesis.'
        : label === 'Risk-On'
          ? 'El mercado mantiene tono constructivo: priorizamos calidad con catalizadores y disciplina de ejecución.'
          : 'El mercado permanece mixto: mantenemos sesgo balanceado mientras esperamos confirmaciones.';

    return {
      label,
      narrative,
      confidence,
      evidence: [
        { key: 'coverage', value: coverage, note: 'cantidad de observaciones recientes' },
        { key: 'avg_abs_move_pct', value: avgMove, note: 'movimiento absoluto promedio' }
      ]
    };
  };

  const computeAndPersist = async (runDate) => {
    const signals = await getLatestMarketSignals(runDate);
    const current = classify(signals);

    const previousOut = await safeQuery(
      query,
      `SELECT as_of_date::text AS as_of_date, label, narrative, confidence
       FROM regime_snapshots
       WHERE as_of_date < $1::date
       ORDER BY as_of_date DESC
       LIMIT 1`,
      [runDate]
    );

    const previous = previousOut.rows?.[0] || null;
    let finalLabel = current.label;
    let finalNarrative = current.narrative;

    if (previous?.label && previous.label !== current.label) {
      const material = await hasMaterialThemeDelta(runDate);
      if (!material) {
        finalLabel = previous.label;
        finalNarrative = String(previous.narrative || current.narrative);
      }
    }

    await safeQuery(
      query,
      `INSERT INTO regime_snapshots (as_of_date, model_version, label, narrative, signals, confidence, evidence, created_at)
       VALUES ($1::date, $2, $3, $4, $5::jsonb, $6, $7::jsonb, NOW())
       ON CONFLICT (as_of_date, model_version)
       DO UPDATE SET label = EXCLUDED.label,
                     narrative = EXCLUDED.narrative,
                     signals = EXCLUDED.signals,
                     confidence = EXCLUDED.confidence,
                     evidence = EXCLUDED.evidence,
                     created_at = NOW()`,
      [
        runDate,
        modelVersion,
        finalLabel,
        finalNarrative,
        JSON.stringify(signals),
        current.confidence,
        JSON.stringify(current.evidence)
      ]
    );

    return {
      date: runDate,
      label: finalLabel,
      state: finalLabel,
      narrative: finalNarrative,
      confidence: current.confidence,
      signals,
      evidence: current.evidence,
      modelVersion
    };
  };

  const getSnapshot = async ({ date } = {}) => {
    const runDate = date || artDate();
    const out = await safeQuery(
      query,
      `SELECT as_of_date::text AS date, label, narrative, signals, confidence, evidence, model_version
       FROM regime_snapshots
       WHERE as_of_date = $1::date AND model_version = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [runDate, modelVersion]
    );

    const row = out.rows?.[0];
    if (row) {
      return {
        date: row.date,
        label: String(row.label || 'Neutral'),
        state: String(row.label || 'Neutral'),
        narrative: String(row.narrative || 'Mercado mixto.'),
        signals: row.signals && typeof row.signals === 'object' ? row.signals : {},
        confidence: toNum(row.confidence, 50),
        evidence: Array.isArray(row.evidence) ? row.evidence : [],
        modelVersion: String(row.model_version || modelVersion)
      };
    }

    try {
      return await computeAndPersist(runDate);
    } catch (error) {
      logger.error('[regimeEngine] compute failed, returning fallback', error?.message || error);
      return {
        date: runDate,
        label: 'Neutral',
        state: 'Neutral',
        narrative: 'Mercado mixto con datos parciales; mantenemos enfoque disciplinado.',
        signals: {},
        confidence: 40,
        evidence: [],
        modelVersion
      };
    }
  };

  return { artDate, getSnapshot };
};

module.exports = { createRegimeEngine };
