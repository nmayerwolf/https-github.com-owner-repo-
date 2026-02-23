const DISLOCATION_KEYWORDS = ['not priced', 'consensus', 'positioning', 'mispricing'];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const countNumericFacts = (text) => {
  const matches = String(text || '').match(/\b\d+(?:[.,]\d+)?(?:%|bps|x|m|bn|b|k)?\b/gi);
  return Array.isArray(matches) ? matches.length : 0;
};

const hasDatedEvent = (text) => {
  const raw = normalizeText(text);
  if (!raw) return false;
  if (/\b(earnings|cpi|fomc|fed|payroll|pmi|results|guidance|meeting|decision)\b/.test(raw)) return true;
  if (/\b(?:q[1-4]\s*20\d{2}|20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b/.test(raw)) return true;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(raw)) return true;
  return false;
};

const hasDislocation = (text) => {
  const raw = normalizeText(text);
  return DISLOCATION_KEYWORDS.some((keyword) => raw.includes(keyword));
};

const hasSpecificRisks = (text) => {
  const raw = normalizeText(text);
  if (!raw) return false;
  const words = raw.split(/\s+/).filter(Boolean);
  return words.length >= 8 && /\b(if|unless|because|trigger|scenario|risk|downside|volatility|regulation)\b/.test(raw);
};

const asBreakdownValue = (score) => Number(clamp(score, 1, 5).toFixed(1));

const createConvictionEngine = () => {
  const scoreIdea = (input = {}) => {
    const fundamentalsText = String(input.fundamentals || '');
    const catalystText = String(input.catalyst || '');
    const dislocationText = String(input.dislocation || '');
    const risksText = String(input.risks || '');

    const numericFacts = countNumericFacts(fundamentalsText);
    const fundamentalsBoost = numericFacts >= 2 ? 0.5 : 0;
    const catalystBoost = catalystText.trim() && hasDatedEvent(catalystText) ? 0.5 : 0;
    const dislocationBoost = hasDislocation(dislocationText) ? 0.5 : 0;
    const riskBoost = hasSpecificRisks(risksText) ? 0.5 : 0;

    const total = Number(clamp(2.0 + fundamentalsBoost + catalystBoost + dislocationBoost + riskBoost, 1.0, 5.0).toFixed(1));
    const breakdown = {
      fundamentals: asBreakdownValue(1 + Math.min(4, numericFacts >= 2 ? 2.5 : numericFacts >= 1 ? 1.5 : 0.5)),
      catalyst: asBreakdownValue(1 + (catalystText.trim() ? 1.5 : 0) + (hasDatedEvent(catalystText) ? 1.0 : 0)),
      dislocation: asBreakdownValue(1 + (dislocationText.trim() ? 1.5 : 0) + (hasDislocation(dislocationText) ? 1.0 : 0)),
      asymmetry: asBreakdownValue(1 + (hasSpecificRisks(risksText) ? 2.0 : 0.5) + (hasDislocation(dislocationText) ? 1.0 : 0))
    };

    return {
      total,
      breakdown,
      rationale: `We score this with a deterministic placeholder so we can replace the model later without changing schema or UI.`,
      keySources: [{ label: 'Placeholder scoring', provider: 'internal', date_or_period: 'V1' }],
      highConviction: total >= 4.5
    };
  };

  const changedMaterialText = (prevField, nextField) => {
    const prev = normalizeText(prevField);
    const next = normalizeText(nextField);
    if (prev === next) return false;
    return Math.abs(prev.length - next.length) >= 16 || (prev && next && !prev.includes(next) && !next.includes(prev));
  };

  const shouldPublishUpdate = (prev = {}, next = {}, prevFields = {}, nextFields = {}) => {
    const prevTotal = Number(prev.conviction_total ?? prev.total ?? 0);
    const nextTotal = Number(next.conviction_total ?? next.total ?? 0);
    if (Math.abs(nextTotal - prevTotal) >= 0.5) return true;
    if (String(prev.status || '') !== String(next.status || '')) return true;
    if (Boolean(prev.high_conviction ?? prev.highConviction) !== Boolean(next.high_conviction ?? next.highConviction)) return true;

    if (changedMaterialText(prevFields.catalyst, nextFields.catalyst)) return true;
    if (changedMaterialText(prevFields.risks, nextFields.risks)) return true;

    return false;
  };

  return {
    scoreIdea,
    shouldPublishUpdate
  };
};

module.exports = {
  createConvictionEngine
};
