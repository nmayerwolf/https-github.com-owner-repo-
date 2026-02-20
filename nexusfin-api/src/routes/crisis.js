const express = require('express');
const { query } = require('../config/db');

const router = express.Router();

const isoDate = () => new Date().toISOString().slice(0, 10);

const buildPayload = (row = {}, date = isoDate()) => {
  const isActive = Boolean(row.is_active);
  const summary = String(row.summary || (isActive
    ? 'Volatilidad elevada detectada. Se priorizan alertas de riesgo y se reducen ideas tácticas.'
    : 'Entorno sin señales de crisis activas.'));

  return {
    date,
    isActive,
    title: isActive ? 'High Volatility Environment' : 'Normal Market Environment',
    summary,
    learnMore: row.learn_more && typeof row.learn_more === 'object'
      ? row.learn_more
      : {
          triggers: Array.isArray(row.triggers) ? row.triggers : [],
          changes: isActive
            ? [
                'Se eleva el umbral mínimo de confianza (+0.10).',
                'Se reduce el número de recomendaciones mostradas.',
                'Se priorizan alertas de riesgo en Recommendations.'
              ]
            : []
        },
    triggers: Array.isArray(row.triggers) ? row.triggers : []
  };
};

router.get('/today', async (_req, res, next) => {
  const date = isoDate();
  try {
    const out = await query(
      'SELECT is_active, triggers, summary, learn_more FROM crisis_state WHERE date = $1',
      [date]
    );

    if (out.rows.length) {
      return res.json(buildPayload(out.rows[0], date));
    }

    const regime = await query(
      'SELECT volatility_regime, risk_flags FROM regime_state WHERE date = $1',
      [date]
    );

    const inferredActive = String(regime.rows?.[0]?.volatility_regime || '').toLowerCase() === 'crisis';
    return res.json(
      buildPayload(
        {
          is_active: inferredActive,
          triggers: inferredActive ? ['volatility_regime=crisis'] : [],
          summary: inferredActive
            ? 'Se detectó régimen de volatilidad de crisis en el cálculo diario.'
            : 'Sin estado de crisis explícito para la fecha actual.',
          learn_more: {
            source: inferredActive ? 'regime_state inference' : 'default',
            riskFlags: Array.isArray(regime.rows?.[0]?.risk_flags) ? regime.rows[0].risk_flags : []
          }
        },
        date
      )
    );
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
