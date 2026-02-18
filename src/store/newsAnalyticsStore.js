const NEWS_CTR_KEY = 'horsai_news_ctr_v1';

const emptyState = () => ({
  impressions: {},
  clicks: {}
});

const loadState = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return emptyState();
    const raw = window.localStorage.getItem(NEWS_CTR_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return {
      impressions: parsed?.impressions && typeof parsed.impressions === 'object' ? parsed.impressions : {},
      clicks: parsed?.clicks && typeof parsed.clicks === 'object' ? parsed.clicks : {}
    };
  } catch {
    return emptyState();
  }
};

const saveState = (state) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      NEWS_CTR_KEY,
      JSON.stringify({
        impressions: state.impressions || {},
        clicks: state.clicks || {}
      })
    );
  } catch {
    // noop
  }
};

const toId = (item) => String(item?.id || item?.url || '').trim();

const mergeItemStats = (prev = {}, item = {}, now = Date.now()) => ({
  count: Number(prev.count || 0) + 1,
  lastAt: now,
  theme: String(item?.aiTheme || prev.theme || 'global'),
  score: Number(item?.impactScore || item?.aiScore || prev.score || 0),
  headline: String(item?.headline || prev.headline || '')
});

export const recordRecommendedImpressions = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return;
  const state = loadState();
  const now = Date.now();
  for (const item of list) {
    const id = toId(item);
    if (!id) continue;
    state.impressions[id] = mergeItemStats(state.impressions[id], item, now);
  }
  saveState(state);
};

export const recordRecommendedClick = (item = {}) => {
  const id = toId(item);
  if (!id) return;
  const state = loadState();
  state.clicks[id] = mergeItemStats(state.clicks[id], item, Date.now());
  saveState(state);
};

export const getNewsCtrSummary = ({ days = 7 } = {}) => {
  const state = loadState();
  const cutoff = Date.now() - Math.max(1, Number(days || 7)) * 24 * 60 * 60 * 1000;
  const impressionsEntries = Object.values(state.impressions || {}).filter((row) => Number(row?.lastAt || 0) >= cutoff);
  const clicksEntries = Object.values(state.clicks || {}).filter((row) => Number(row?.lastAt || 0) >= cutoff);

  const impressions = impressionsEntries.reduce((acc, row) => acc + Number(row.count || 0), 0);
  const clicks = clicksEntries.reduce((acc, row) => acc + Number(row.count || 0), 0);
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  const byThemeMap = new Map();
  for (const row of impressionsEntries) {
    const theme = String(row.theme || 'global');
    const current = byThemeMap.get(theme) || { theme, impressions: 0, clicks: 0 };
    current.impressions += Number(row.count || 0);
    byThemeMap.set(theme, current);
  }
  for (const row of clicksEntries) {
    const theme = String(row.theme || 'global');
    const current = byThemeMap.get(theme) || { theme, impressions: 0, clicks: 0 };
    current.clicks += Number(row.count || 0);
    byThemeMap.set(theme, current);
  }

  const byTheme = [...byThemeMap.values()]
    .map((row) => ({
      ...row,
      ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0
    }))
    .sort((a, b) => Number(b.ctr || 0) - Number(a.ctr || 0));

  return {
    impressions,
    clicks,
    ctr,
    byTheme
  };
};

export const resetNewsCtrStats = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(NEWS_CTR_KEY);
  } catch {
    // noop
  }
};

