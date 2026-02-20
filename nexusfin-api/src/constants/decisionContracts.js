const cleanText = (value, maxLen = 180) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);

const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const toEvent = (row = {}) => ({
  id: String(row.id || ''),
  headline: cleanText(row.headline, 140),
  summary: cleanText(row.summary, 220),
  tags: Array.isArray(row.tags) ? row.tags.map((x) => cleanText(x, 40)).filter(Boolean).slice(0, 8) : [],
  tickers: Array.isArray(row.tickers) ? row.tickers.map((x) => cleanText(x, 16).toUpperCase()).filter(Boolean).slice(0, 6) : [],
  ts: String(row.ts || ''),
  score: toNum(row.score, 0)
});

const toBullet = ({ event, marketImpact, whyItMatters }) => ({
  event: cleanText(event, 140),
  marketImpact: cleanText(marketImpact, 140),
  whyItMatters: cleanText(whyItMatters, 140),
  line: `[${cleanText(event, 80)}] -> [${cleanText(marketImpact, 80)}] -> [${cleanText(whyItMatters, 80)}]`
});

const toInstrumentCandidate = (value = {}) => ({
  symbol: cleanText(value.symbol, 24).toUpperCase(),
  label: cleanText(value.label, 80),
  type: cleanText(value.type, 32),
  specificity: cleanText(value.specificity, 24)
});

const toThemeIdea = (value = {}) => ({
  ideaId: cleanText(value.ideaId, 80),
  theme: cleanText(value.theme, 80),
  thesis: cleanText(value.thesis, 220),
  whyNow: Array.isArray(value.whyNow) ? value.whyNow.map((x) => cleanText(x, 180)).filter(Boolean).slice(0, 3) : [],
  risks: Array.isArray(value.risks) ? value.risks.map((x) => cleanText(x, 180)).filter(Boolean).slice(0, 2) : [],
  invalidation: cleanText(value.invalidation, 190),
  horizon: cleanText(value.horizon, 64),
  instruments: Array.isArray(value.instruments) ? value.instruments.map(toInstrumentCandidate).filter((x) => x.symbol).slice(0, 3) : [],
  convictionScore: Math.max(0, Math.min(10, toNum(value.convictionScore, 0))),
  convictionBreakdown: value.convictionBreakdown && typeof value.convictionBreakdown === 'object' ? value.convictionBreakdown : {},
  category: cleanText(value.category, 32),
  action: cleanText(value.action, 24)
});

const toPortfolioSnapshot = (value = {}) => {
  const exposures = value?.themeExposure && typeof value.themeExposure === 'object' ? value.themeExposure : {};
  return {
    hasPortfolio: Boolean(value.hasPortfolio),
    themeExposure: Object.fromEntries(
      Object.entries(exposures)
        .map(([theme, status]) => [cleanText(theme, 48), cleanText(status, 32)])
        .filter(([theme, status]) => theme && status)
    ),
    topThemes: Array.isArray(value.topThemes) ? value.topThemes.map((x) => cleanText(x, 48)).filter(Boolean).slice(0, 5) : [],
    fundingSuggestion: cleanText(value.fundingSuggestion, 180)
  };
};

const toIdeaState = (value = {}) => ({
  horizonDays: Math.max(1, Math.min(120, Math.round(toNum(value.horizonDays, 14)))),
  createdDate: cleanText(value.createdDate, 16),
  nextReviewDate: cleanText(value.nextReviewDate, 16),
  expiryDate: cleanText(value.expiryDate, 16),
  status: cleanText(value.status || 'active', 24),
  reviewSuggestion: cleanText(value.reviewSuggestion, 80),
  daysRemaining: Math.max(-365, Math.min(365, Math.round(toNum(value.daysRemaining, 0))))
});

module.exports = {
  toEvent,
  toBullet,
  toThemeIdea,
  toInstrumentCandidate,
  toPortfolioSnapshot,
  toIdeaState,
  clamp01
};
