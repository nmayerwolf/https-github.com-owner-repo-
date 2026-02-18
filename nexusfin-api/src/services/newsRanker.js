const KEYWORDS_HIGH = [
  'earnings',
  'guidance',
  'merger',
  'acquisition',
  'ipo',
  'rate',
  'inflation',
  'fed',
  'ecb',
  'tariff',
  'sanction',
  'war',
  'ceasefire',
  'election',
  'opec',
  'debt',
  'default',
  'stimulus',
  'regulation',
  'antitrust',
  'launch',
  'funding',
  'round',
  'geopolitical',
  'bankrupt',
  'layoff',
  'recession',
  'gdp',
  'export',
  'import',
  'treasury'
];

const KEYWORDS_MED = ['forecast', 'outlook', 'policy', 'tax', 'strike', 'supply', 'demand', 'upgrade', 'downgrade', 'contract', 'deal'];
const KEYWORDS_GLOBAL = [
  'china',
  'europe',
  'asia',
  'middle east',
  'russia',
  'ukraine',
  'taiwan',
  'india',
  'brazil',
  'japan',
  'boj',
  'pboc',
  'imf',
  'world bank',
  'brics',
  'g7',
  'g20'
];
const KEYWORDS_MACRO = ['fed', 'ecb', 'boj', 'pboc', 'rate', 'inflation', 'gdp', 'recession', 'treasury', 'yield', 'cpi', 'ppi'];
const KEYWORDS_GEOPOLITICAL = [
  'trump',
  'white house',
  'china',
  'beijing',
  'taiwan',
  'ukraine',
  'russia',
  'middle east',
  'sanction',
  'tariff',
  'election'
];
const KEYWORDS_COMMODITIES = ['gold', 'silver', 'oil', 'brent', 'wti', 'natural gas', 'opec', 'commodity'];
const KEYWORDS_FX = ['eur/usd', 'usd/jpy', 'usd/cny', 'yuan', 'dollar index', 'forex', 'fx'];
const KEYWORDS_CRYPTO = ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'stablecoin'];
const NOISE_KEYWORDS = [
  'celebrity',
  'movie',
  'music',
  'streaming show',
  'sports',
  'football',
  'soccer',
  'tennis',
  'nfl',
  'nba'
];

const normalizeSymbolSet = (symbols = []) =>
  new Set(
    (Array.isArray(symbols) ? symbols : [])
      .map((s) => String(s || '').trim().toUpperCase())
      .filter(Boolean)
  );

const scoreNewsItem = (item = {}, watchlistSymbols = []) => {
  const headline = String(item.headline || '').toLowerCase();
  const summary = String(item.summary || '').toLowerCase();
  const text = `${headline} ${summary}`;
  let score = 0;
  const reasons = [];
  let highHits = 0;
  let medHits = 0;
  let globalHits = 0;

  for (const kw of KEYWORDS_HIGH) {
    if (text.includes(kw)) {
      score += 4;
      highHits += 1;
      reasons.push(`high:${kw}`);
    }
  }
  for (const kw of KEYWORDS_MED) {
    if (text.includes(kw)) {
      score += 2;
      medHits += 1;
      reasons.push(`medium:${kw}`);
    }
  }
  for (const kw of KEYWORDS_GLOBAL) {
    if (text.includes(kw)) {
      score += 2;
      globalHits += 1;
      reasons.push(`global:${kw}`);
    }
  }
  for (const kw of NOISE_KEYWORDS) {
    if (text.includes(kw)) {
      score -= 4;
      reasons.push(`noise:${kw}`);
    }
  }

  const related = String(item.related || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const watchlist = normalizeSymbolSet(watchlistSymbols);
  const matchedSymbols = related.filter((s) => watchlist.has(s));
  if (matchedSymbols.length) {
    score += matchedSymbols.length * 5;
    reasons.push(`watchlist:${matchedSymbols.join(',')}`);
  }
  if (related.length >= 2) {
    score += 2;
    reasons.push('cross-asset');
  }

  const ts = Number(item.datetime || 0);
  if (Number.isFinite(ts) && ts > 0) {
    const ageMinutes = Math.max(1, Math.floor((Date.now() - ts * 1000) / 60000));
    if (ageMinutes <= 60) {
      score += 4;
      reasons.push('fresh:1h');
    } else if (ageMinutes <= 240) {
      score += 2;
      reasons.push('fresh:4h');
    }
  }

  const marketImpactSignals = highHits + medHits + globalHits + matchedSymbols.length;
  if (marketImpactSignals >= 3) {
    score += 3;
    reasons.push('impact:strong');
  } else if (marketImpactSignals >= 1) {
    score += 1;
    reasons.push('impact:moderate');
  }

  return {
    score,
    matchedSymbols,
    reasons: Array.from(new Set(reasons)).slice(0, 8),
    impactSignals: marketImpactSignals
  };
};

const hasKeyword = (text, keywords) => keywords.some((kw) => text.includes(kw));

const classifyTheme = (item = {}) => {
  const text = `${String(item?.headline || '').toLowerCase()} ${String(item?.summary || '').toLowerCase()}`;
  if (hasKeyword(text, KEYWORDS_MACRO)) return 'macro';
  if (hasKeyword(text, KEYWORDS_GEOPOLITICAL)) return 'geopolitics';
  if (hasKeyword(text, KEYWORDS_COMMODITIES)) return 'commodities';
  if (hasKeyword(text, KEYWORDS_FX)) return 'fx';
  if (hasKeyword(text, KEYWORDS_CRYPTO)) return 'crypto';
  const related = String(item?.related || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (related.length > 0) return 'equity';
  return 'general';
};

const diversifyByTheme = (items = [], limit = 60) => {
  const groups = new Map();
  for (const item of items) {
    const theme = String(item?.aiTheme || 'general');
    if (!groups.has(theme)) groups.set(theme, []);
    groups.get(theme).push(item);
  }

  const priority = ['macro', 'geopolitics', 'commodities', 'fx', 'crypto', 'equity', 'general'];
  const orderedGroups = priority
    .filter((theme) => groups.has(theme))
    .map((theme) => ({ theme, rows: groups.get(theme) }))
    .concat([...groups.entries()].filter(([theme]) => !priority.includes(theme)).map(([theme, rows]) => ({ theme, rows })));

  const result = [];
  let cursor = 0;
  while (result.length < limit) {
    let progressed = false;
    for (const group of orderedGroups) {
      if (cursor < group.rows.length) {
        result.push(group.rows[cursor]);
        progressed = true;
        if (result.length >= limit) break;
      }
    }
    if (!progressed) break;
    cursor += 1;
  }
  return result;
};

const rankNews = (
  items = [],
  {
    watchlistSymbols = [],
    minScore = 6,
    limit = 60,
    maxAgeHours = null,
    strictImpact = false,
    diversify = true,
    themeCtrBoost = {}
  } = {}
) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const maxAgeSec = Number.isFinite(Number(maxAgeHours)) && Number(maxAgeHours) > 0 ? Number(maxAgeHours) * 3600 : null;
  const scored = (Array.isArray(items) ? items : []).map((item) => {
    const out = scoreNewsItem(item, watchlistSymbols);
    const theme = classifyTheme(item);
    const ctr = Number(themeCtrBoost?.[theme] ?? 0);
    const boost = Number.isFinite(ctr) ? Math.max(-2, Math.min(4, ctr / 15)) : 0;
    return {
      ...item,
      aiScore: out.score + boost,
      aiMatchedSymbols: out.matchedSymbols,
      aiReasons: out.reasons,
      aiImpactSignals: out.impactSignals,
      aiTheme: theme,
      aiThemeCtr: Number.isFinite(ctr) ? ctr : 0,
      aiThemeCtrBoost: boost
    };
  });

  const filtered = scored.filter((item) => {
    const scorePass = Number(item.aiScore || 0) >= Number(minScore || 0);
    if (!scorePass) return false;

    if (strictImpact && Number(item.aiImpactSignals || 0) <= 0) return false;

    if (maxAgeSec) {
      const ts = Number(item.datetime || 0);
      if (!Number.isFinite(ts) || ts <= 0) return false;
      if (nowSec - ts > maxAgeSec) return false;
    }

    return true;
  });
  const sorted = filtered
    .sort((a, b) => {
      const scoreA = Number(a.aiScore || 0);
      const scoreB = Number(b.aiScore || 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      const ta = Number(a.datetime || 0);
      const tb = Number(b.datetime || 0);
      return tb - ta;
    });
  const hardLimit = Math.max(1, Number(limit || 60));
  return diversify ? diversifyByTheme(sorted, hardLimit) : sorted.slice(0, hardLimit);
};

module.exports = { rankNews, scoreNewsItem };
