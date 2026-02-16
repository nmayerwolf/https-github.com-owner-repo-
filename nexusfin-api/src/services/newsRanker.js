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

  for (const kw of KEYWORDS_HIGH) {
    if (text.includes(kw)) {
      score += 4;
      reasons.push(`high:${kw}`);
    }
  }
  for (const kw of KEYWORDS_MED) {
    if (text.includes(kw)) {
      score += 2;
      reasons.push(`medium:${kw}`);
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

  return {
    score,
    matchedSymbols,
    reasons: Array.from(new Set(reasons)).slice(0, 6)
  };
};

const rankNews = (items = [], { watchlistSymbols = [], minScore = 6, limit = 60 } = {}) => {
  const scored = (Array.isArray(items) ? items : []).map((item) => {
    const out = scoreNewsItem(item, watchlistSymbols);
    return {
      ...item,
      aiScore: out.score,
      aiMatchedSymbols: out.matchedSymbols,
      aiReasons: out.reasons
    };
  });

  const filtered = scored.filter((item) => Number(item.aiScore || 0) >= Number(minScore || 0));
  return filtered
    .sort((a, b) => {
      const ta = Number(a.datetime || 0);
      const tb = Number(b.datetime || 0);
      return tb - ta;
    })
    .slice(0, Math.max(1, Number(limit || 60)));
};

module.exports = { rankNews, scoreNewsItem };
