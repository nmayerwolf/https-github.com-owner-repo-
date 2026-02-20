const express = require('express');
const { query } = require('../config/db');
const { badRequest } = require('../utils/errors');

const router = express.Router();

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (raw) => {
  const value = String(raw || '').trim();
  if (!ISO_DATE_RE.test(value)) throw badRequest('date inválida (YYYY-MM-DD)', 'VALIDATION_ERROR');
  return value;
};

const today = () => new Date().toISOString().slice(0, 10);

const toCrisis = (row = {}) => {
  const isActive = Boolean(row.is_active);
  return {
    isActive,
    title: isActive ? 'High Volatility Environment' : 'Normal Market Environment',
    summary: String(row.summary || (isActive ? 'Volatilidad elevada: postura más cauta y foco en riesgo.' : 'Sin crisis activa.')),
    learnMore: row.learn_more && typeof row.learn_more === 'object'
      ? row.learn_more
      : {
          triggers: Array.isArray(row.triggers) ? row.triggers : [],
          changes: isActive
            ? [
                'Umbral de confianza más alto.',
                'Menor cantidad de ideas tácticas.',
                'Alertas de riesgo priorizadas.'
              ]
            : []
        }
  };
};

const toRegime = (row = {}) => ({
  regime: row.regime || null,
  volatilityRegime: row.volatility_regime || null,
  leadership: Array.isArray(row.leadership) ? row.leadership : [],
  macroDrivers: Array.isArray(row.macro_drivers) ? row.macro_drivers : [],
  riskFlags: Array.isArray(row.risk_flags) ? row.risk_flags : [],
  confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null
});

const ensureCapitalBriefFormat = (digestBullets = []) =>
  (Array.isArray(digestBullets) ? digestBullets : [])
    .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => {
      const rawParts = line.split(/\s*(?:->|→)\s*/).map((x) => x.trim()).filter(Boolean);
      if (rawParts.length >= 3) {
        return `[${rawParts[0].replace(/^\[|\]$/g, '')}] -> [${rawParts[1].replace(/^\[|\]$/g, '')}] -> [${rawParts[2].replace(/^\[|\]$/g, '')}]`;
      }
      return `[${line.slice(0, 70)}] -> [impacto mercado en evaluación] -> [importa por riesgo/retorno de capital]`;
    })
    .slice(0, 10);

const handler = async (req, res, next, date) => {
  try {
    const [digestOut, regimeOut, crisisOut] = await Promise.all([
      query(
        `SELECT bullets, regime_summary, crisis_banner, themes, risk_flags, raw_structured
         FROM daily_digest
         WHERE user_id = $1 AND date = $2`,
        [req.user.id, date]
      ),
      query(
        `SELECT regime, volatility_regime, leadership, macro_drivers, risk_flags, confidence
         FROM regime_state WHERE date = $1`,
        [date]
      ),
      query(
        `SELECT is_active, triggers, summary, learn_more
         FROM crisis_state WHERE date = $1`,
        [date]
      )
    ]);

    const digest = digestOut.rows[0] || {};
    const regime = toRegime(regimeOut.rows[0] || {});
    const bullets = ensureCapitalBriefFormat(Array.isArray(digest.bullets) ? digest.bullets : []);

    return res.json({
      date,
      crisis: toCrisis(crisisOut.rows[0] || digest.crisis_banner || {}),
      regime,
      bullets,
      themes: Array.isArray(digest.themes) ? digest.themes : regime.leadership,
      riskFlags: Array.isArray(digest.risk_flags) ? digest.risk_flags : regime.riskFlags
    });
  } catch (error) {
    return next(error);
  }
};

router.get('/today', async (req, res, next) => handler(req, res, next, today()));
router.get('/:date', async (req, res, next) => handler(req, res, next, toDate(req.params.date)));

module.exports = router;
