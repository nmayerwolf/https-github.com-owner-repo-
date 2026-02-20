const express = require('express');
const { query } = require('../config/db');
const { badRequest } = require('../utils/errors');
const { toThemeIdea, toInstrumentCandidate, toPortfolioSnapshot, toIdeaState } = require('../constants/decisionContracts');

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
    summary: String(row.summary || (isActive ? 'Volatilidad elevada: se prioriza preservación de capital.' : 'Sin crisis activa.')),
    learnMore: row.learn_more && typeof row.learn_more === 'object'
      ? row.learn_more
      : {
          triggers: Array.isArray(row.triggers) ? row.triggers : [],
          changes: isActive
            ? [
                'Sube el umbral mínimo de confianza.',
                'Se reduce la cantidad de ideas mostradas.',
                'Se muestran primero Risk Alerts.'
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

const THEME_INSTRUMENTS = {
  technology: ['XLK', 'QQQ'],
  energy: ['XLE', 'XOM'],
  financials: ['XLF', 'JPM'],
  healthcare: ['XLV', 'UNH'],
  industrials: ['XLI', 'GE'],
  consumer_discretionary: ['XLY', 'AMZN'],
  consumer_staples: ['XLP', 'PG'],
  utilities: ['XLU', 'DUK'],
  materials: ['XLB', 'LIN'],
  real_estate: ['XLRE', 'PLD'],
  broad_equity: ['SPY', 'QQQ'],
  special_situations: ['SPY', 'IWM'],
  rates: ['IEF', 'TLT'],
  credit: ['HYG', 'LQD']
};

const toTitle = (value = '') =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (x) => x.toUpperCase())
    .trim();

const isoDateToday = () => new Date().toISOString().slice(0, 10);

const addDaysIso = (iso, days) => {
  const [yy, mm, dd] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!yy || !mm || !dd) return String(iso || '').slice(0, 10);
  const dt = new Date(Date.UTC(yy, mm - 1, dd + Number(days || 0)));
  return dt.toISOString().slice(0, 10);
};

const daysBetweenIso = (fromIso, toIso) => {
  const from = Date.parse(`${String(fromIso || '').slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${String(toIso || '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86400000);
};

const normalizeItem = (row = {}) => {
  const category = row.category || 'strategic';
  const convictionScoreRaw = Number(row.convictionScore ?? row.conviction_score);
  const convictionScore = Number.isFinite(convictionScoreRaw) ? convictionScoreRaw : Number(row.confidence || 0) * 10;
  const ideaState = row.ideaState && typeof row.ideaState === 'object' ? row.ideaState : {};
  const horizonDays = Number.isFinite(Number(ideaState.horizonDays)) ? Number(ideaState.horizonDays) : row.timeframe === 'months' ? 63 : 21;
  const createdDate = String(ideaState.createdDate || row.date || isoDateToday()).slice(0, 10);
  const nextReviewDate = String(ideaState.nextReviewDate || addDaysIso(createdDate, Math.min(14, Math.max(5, Math.round(horizonDays / 3))))).slice(0, 10);
  const expiryDate = String(ideaState.expiryDate || addDaysIso(createdDate, horizonDays)).slice(0, 10);
  const theme = String(row.theme || (Array.isArray(row.tags) ? row.tags.find((x) => String(x || '').includes('_') || String(x || '').length > 3) : '') || '').toLowerCase();

  const out = {
    ideaId: String(row.ideaId || row.idea_id || ''),
    symbol: row.symbol || null,
    action: row.action || 'WATCH',
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0,
    convictionScore: Number(Math.max(0, Math.min(10, convictionScore)).toFixed(1)),
    convictionBreakdown: row.convictionBreakdown && typeof row.convictionBreakdown === 'object' ? row.convictionBreakdown : {},
    timeframe: row.timeframe || 'weeks',
    invalidation: row.invalidation || null,
    rationale: Array.isArray(row.rationale) ? row.rationale.slice(0, 3) : [],
    risks: Array.isArray(row.risks) ? row.risks.slice(0, 2) : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    category,
    severity: row.severity || null,
    theme,
    ideaState: toIdeaState({
      ...ideaState,
      horizonDays,
      createdDate,
      nextReviewDate,
      expiryDate,
      status: ideaState.status || 'active',
      reviewSuggestion: ideaState.reviewSuggestion || 'extend',
      daysRemaining: daysBetweenIso(isoDateToday(), expiryDate)
    })
  };

  if (category === 'opportunistic') {
    out.opportunisticType = row.opportunisticType || row.opportunistic_type || null;
  }

  return out;
};

const splitSections = (items = []) => {
  const normalized = items.map(normalizeItem).filter((item) => item.ideaId || item.symbol);
  const strategic = normalized.filter((item) => item.category === 'strategic');
  const opportunistic = normalized.filter((item) => item.category === 'opportunistic');
  const riskAlerts = normalized.filter((item) => item.category === 'risk');

  return {
    strategic: strategic.slice(0, 2),
    opportunistic: opportunistic.slice(0, 1),
    riskAlerts: riskAlerts.slice(0, 1)
  };
};

const loadItems = async (userId, date) => {
  const userOut = await query('SELECT items FROM user_recommendations WHERE user_id = $1 AND date = $2', [userId, date]);
  if (userOut.rows.length) {
    const items = Array.isArray(userOut.rows[0].items) ? userOut.rows[0].items : [];
    if (items.length) return items;
  }

  const baseOut = await query(
    `SELECT idea_id, symbol, action, confidence, timeframe, invalidation, rationale, risks, tags, category, opportunistic_type, severity
     FROM base_ideas
     WHERE date = $1
     ORDER BY confidence DESC NULLS LAST, idea_id ASC`,
    [date]
  );

  return baseOut.rows;
};

const loadPortfolioHoldingsThemes = async (userId) => {
  const out = await query(
    `SELECT p.symbol, p.quantity, p.buy_price,
            COALESCE(NULLIF(LOWER(u.sector), ''), LOWER(p.category), 'unknown') AS theme
     FROM positions p
     JOIN portfolios pf ON pf.id = p.portfolio_id AND pf.deleted_at IS NULL
     LEFT JOIN portfolio_collaborators pc ON pc.portfolio_id = pf.id AND pc.user_id = $1
     LEFT JOIN universe_symbols u ON u.symbol = p.symbol
     WHERE p.deleted_at IS NULL
       AND p.sell_date IS NULL
       AND (pf.user_id = $1 OR pc.user_id = $1)`,
    [userId]
  );
  return out.rows || [];
};

const resolveThemeStatus = (pct) => {
  if (pct >= 35) return 'sobreexpuesto';
  if (pct >= 15) return 'neutro';
  return 'subexpuesto';
};

const buildPortfolioFit = ({ topIdea, rows }) => {
  if (!Array.isArray(rows) || !rows.length || !topIdea) {
    return toPortfolioSnapshot({ hasPortfolio: false, themeExposure: {}, topThemes: [], fundingSuggestion: '' });
  }

  const byTheme = {};
  let total = 0;
  for (const row of rows) {
    const theme = String(row.theme || 'unknown').toLowerCase();
    const value = Number(row.quantity || 0) * Number(row.buy_price || 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    total += value;
    byTheme[theme] = (byTheme[theme] || 0) + value;
  }
  if (!total) {
    return toPortfolioSnapshot({ hasPortfolio: false, themeExposure: {}, topThemes: [], fundingSuggestion: '' });
  }

  const ranked = Object.entries(byTheme)
    .map(([theme, value]) => ({ theme, pct: (value / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
  const themeExposure = Object.fromEntries(ranked.map((x) => [x.theme, resolveThemeStatus(x.pct)]));

  const ideaTheme = String(topIdea.theme || '').toLowerCase();
  const ideaStatus = themeExposure[ideaTheme] || 'subexpuesto';
  const over = ranked.find((x) => resolveThemeStatus(x.pct) === 'sobreexpuesto');
  const fundingSuggestion =
    over && over.theme !== ideaTheme
      ? `Consider reducing ${toTitle(over.theme)} exposure to fund ${toTitle(ideaTheme || 'new-theme')} trade.`
      : '';

  return toPortfolioSnapshot({
    hasPortfolio: true,
    themeExposure,
    topThemes: ranked.slice(0, 3).map((x) => x.theme),
    fundingSuggestion
  });
};

const buildTopIdea = (idea) => {
  if (!idea) return null;
  const theme = toTitle(idea.theme || 'Broad Equity');
  const thesis = `${idea.action === 'SELL' ? 'Priorizar postura defensiva' : 'Tomar exposición selectiva'} en ${idea.symbol || theme} por continuidad de tesis macro/fundamental.`;
  const whyNow = (idea.rationale || []).slice(0, 3);
  const risk = (idea.risks || [])[0] || 'Riesgo de cambio de régimen.';
  const invalidation = idea.invalidation || 'Invalidar si cambia el soporte fundamental de la tesis.';
  const ideaThemeKey = String(idea.theme || 'broad_equity').toLowerCase();
  const [broad, specific] = THEME_INSTRUMENTS[ideaThemeKey] || THEME_INSTRUMENTS.broad_equity;
  const instruments = [
    toInstrumentCandidate({ symbol: broad, label: `Broad theme proxy (${broad})`, type: 'etf', specificity: 'broad' }),
    toInstrumentCandidate({ symbol: specific, label: `Sector or factor expression (${specific})`, type: 'etf_or_equity', specificity: 'targeted' }),
    idea.symbol
      ? toInstrumentCandidate({ symbol: idea.symbol, label: `Specific execution (${idea.symbol})`, type: 'equity', specificity: 'specific' })
      : null
  ].filter(Boolean);

  return toThemeIdea({
    ideaId: idea.ideaId,
    theme,
    thesis,
    whyNow,
    risks: [risk],
    invalidation,
    horizon: `${idea.timeframe === 'months' ? '6-12 weeks' : '2-6 weeks'} (next review ${idea.ideaState?.nextReviewDate || '-'})`,
    instruments,
    convictionScore: idea.convictionScore,
    convictionBreakdown: idea.convictionBreakdown,
    category: idea.category,
    action: idea.action
  });
};

const buildTopIdeas = (items = [], max = 3) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => item.category !== 'risk')
    .sort((a, b) => Number(b.convictionScore || 0) - Number(a.convictionScore || 0))
    .slice(0, max)
    .map(buildTopIdea)
    .filter(Boolean);

const handler = async (req, res, next, date) => {
  try {
    const [items, regimeOut, crisisOut, portfolioRows] = await Promise.all([
      loadItems(req.user.id, date),
      query(
        `SELECT regime, volatility_regime, leadership, macro_drivers, risk_flags, confidence
         FROM regime_state WHERE date = $1`,
        [date]
      ),
      query(
        `SELECT is_active, triggers, summary, learn_more
         FROM crisis_state WHERE date = $1`,
        [date]
      ),
      loadPortfolioHoldingsThemes(req.user.id)
    ]);

    const crisis = toCrisis(crisisOut.rows[0] || {});
    const normalized = (items || []).map(normalizeItem).sort((a, b) => b.convictionScore - a.convictionScore);
    const topIdeaRows = normalized.filter((item) => item.category !== 'risk').slice(0, 3);
    const topIdeaRow = topIdeaRows[0] || null;
    const sections = splitSections(normalized);
    const topIdeas = buildTopIdeas(topIdeaRows, 3);
    const topIdea = topIdeas[0] || null;
    const portfolioFit = buildPortfolioFit({ topIdea: topIdeaRow, rows: portfolioRows });
    const ideaThemeStatus = topIdeaRow ? portfolioFit.themeExposure[String(topIdeaRow.theme || '').toLowerCase()] : null;
    const isOverexposed = ideaThemeStatus === 'sobreexpuesto';

    return res.json({
      date,
      crisis,
      regime: toRegime(regimeOut.rows[0] || {}),
      sections,
      topIdeas,
      topIdea,
      ideaLifecycle: topIdeaRow
        ? {
            daysRemaining: Number(topIdeaRow.ideaState?.daysRemaining ?? 0),
            nextReviewDate: topIdeaRow.ideaState?.nextReviewDate || null,
            horizonDays: Number(topIdeaRow.ideaState?.horizonDays ?? 0),
            reviewSuggestion:
              Number(topIdeaRow.ideaState?.daysRemaining ?? 0) > 0
                ? 'extend'
                : topIdeaRow.action === 'SELL'
                  ? 'exit'
                  : 'reduce'
          }
        : null,
      portfolioFit: {
        ...portfolioFit,
        ideaThemeStatus,
        fitsPortfolio: topIdeaRow ? !isOverexposed : null,
        note: isOverexposed ? 'Idea no encaja por sobreexposición temática. No forzar trade.' : null
      }
    });
  } catch (error) {
    return next(error);
  }
};

router.get('/today', async (req, res, next) => handler(req, res, next, today()));
router.get('/:date', async (req, res, next) => handler(req, res, next, toDate(req.params.date)));

module.exports = router;
