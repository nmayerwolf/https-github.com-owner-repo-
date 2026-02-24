const DISLOCATION_KEYWORDS = ['not priced', 'consensus', 'positioning', 'mispricing'];
const DATE_HINT_RE = /\b(?:q[1-4]\s*20\d{2}|20\d{2}[-/]\d{1,2}[-/]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const toText = (value) => String(value || '').trim();
const toLower = (value) => toText(value).toLowerCase();

const countNumericFacts = (text) => {
  const matches = toText(text).match(/\b\d+(?:[.,]\d+)?(?:%|bps|x|m|bn|b|k)?\b/gi);
  return Array.isArray(matches) ? matches.length : 0;
};

const hasDatedCatalyst = (text) => DATE_HINT_RE.test(toText(text));
const hasDislocation = (text) => {
  const raw = toLower(text);
  return DISLOCATION_KEYWORDS.some((keyword) => raw.includes(keyword));
};

const hasSpecificRisk = (text) => {
  const raw = toLower(text);
  if (!raw) return false;
  const words = raw.split(/\s+/).filter(Boolean).length;
  return words >= 8 && /\b(riesgo|risk|if|unless|escenario|scenario|trigger|regulatorio|volatilidad|downside)\b/.test(raw);
};

const hasPrimaryAndHedge = (instruments = []) => {
  if (!Array.isArray(instruments) || !instruments.length) return false;
  const roles = new Set(instruments.map((item) => toLower(item?.role)));
  return roles.has('primary') && roles.has('hedge');
};

const hasSpecificLevels = (plan) => {
  const text = JSON.stringify(plan || {});
  return countNumericFacts(text) >= 2;
};

const componentScore = (checks) => {
  const yes = checks.filter(Boolean).length;
  return clamp(Math.round((yes / checks.length) * 100), 0, 100);
};

const createConvictionEngine = () => {
  const scoreIdea = (input = {}) => {
    let total = 40;

    const fundamentalsText = toText(input.fundamentals || input.thesis || '');
    const catalystText = toText(input.catalyst || input.catalysts || '');
    const dislocationText = toText(input.dislocation || input.edge || '');
    const risksText = toText(input.risks || '');
    const instruments = Array.isArray(input.instruments) ? input.instruments : [];
    const plan = input.plan || { entry: input.entry, exits: input.exits, sizing: input.sizing };

    const checkNumericFacts = countNumericFacts(fundamentalsText) >= 2;
    const checkDatedCatalyst = Boolean(catalystText) && hasDatedCatalyst(catalystText);
    const checkDislocation = hasDislocation(dislocationText);
    const checkSpecificRisk = hasSpecificRisk(risksText);
    const checkHedgedInstruments = hasPrimaryAndHedge(instruments);
    const checkSpecificLevels = hasSpecificLevels(plan);

    if (checkNumericFacts) total += 10;
    if (checkDatedCatalyst) total += 10;
    if (checkDislocation) total += 10;
    if (checkSpecificRisk) total += 10;
    if (checkHedgedInstruments) total += 10;
    if (checkSpecificLevels) total += 10;

    const breakdown = {
      growth: componentScore([checkNumericFacts, checkDatedCatalyst]),
      valuation: componentScore([checkNumericFacts, checkDislocation]),
      momentum: componentScore([checkDatedCatalyst, checkSpecificLevels]),
      purity: componentScore([checkDislocation, checkHedgedInstruments]),
      risk: componentScore([checkSpecificRisk, checkHedgedInstruments, checkSpecificLevels])
    };

    const totalClamped = clamp(total, 0, 100);
    return {
      total: totalClamped,
      breakdown,
      rationale: 'Scoring placeholder determinístico v1 (reglas de contenido).',
      keySources: [{ label: 'Source: placeholder', provider: 'internal' }],
      highConviction: totalClamped >= 85
    };
  };

  const changedMaterialText = (prevValue, nextValue) => {
    const prev = toLower(prevValue);
    const next = toLower(nextValue);
    if (prev === next) return false;
    return Math.abs(prev.length - next.length) >= 20 || (prev && next && !prev.includes(next) && !next.includes(prev));
  };

  const shouldPublishUpdate = (prev = {}, next = {}, prevFields = {}, nextFields = {}) => {
    const prevScore = Number(prev.conviction_score ?? prev.total ?? 0);
    const nextScore = Number(next.conviction_score ?? next.total ?? 0);

    if (Math.abs(nextScore - prevScore) >= 10) return true;
    if (String(prev.status || '') !== String(next.status || '')) return true;

    const prevHighConviction = Boolean(prev.high_conviction ?? prev.highConviction ?? prevScore >= 85);
    const nextHighConviction = Boolean(next.high_conviction ?? next.highConviction ?? nextScore >= 85);
    if (prevHighConviction !== nextHighConviction) return true;

    if (changedMaterialText(prevFields.catalysts, nextFields.catalysts)) return true;
    if (changedMaterialText(prevFields.risks, nextFields.risks)) return true;

    return false;
  };

  return { scoreIdea, shouldPublishUpdate };
};

module.exports = { createConvictionEngine };
