const { env } = require('../config/env');
const { withTimeout, ensureOk } = require('./httpClient');

const BASE_URL = 'https://newsapi.org/v2';

const isoOrNow = (value) => {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? new Date(ts).toISOString() : new Date().toISOString();
};

const normalize = (article) => ({
  ts: isoOrNow(article?.publishedAt),
  title: String(article?.title || '').trim(),
  description: String(article?.description || '').trim() || undefined,
  sourceName: String(article?.source?.name || '').trim() || undefined,
  url: String(article?.url || '').trim(),
  imageUrl: String(article?.urlToImage || '').trim() || undefined,
  language: 'en',
  sources: [{ vendor: 'newsapi', url: String(article?.url || '').trim() }]
});

const createNewsApiAdapter = ({
  apiKey = env.newsApiKey,
  fetchImpl = global.fetch,
  baseUrl = BASE_URL,
  timeoutMs = env.externalFetchTimeoutMs
} = {}) => {
  const request = async (path, params = {}) => {
    if (!apiKey) throw new Error('Missing NEWS_API_KEY');
    if (!fetchImpl) throw new Error('Missing fetch implementation');

    const qs = new URLSearchParams(params);
    const url = `${baseUrl}${path}?${qs.toString()}`;
    const res = await withTimeout(fetchImpl, url, { headers: { 'X-Api-Key': apiKey } }, timeoutMs);
    await ensureOk(res, `NewsAPI ${path}`);
    return res.json();
  };

  return {
    vendor: 'newsapi',

    async getTopHeadlines(params = {}) {
      const payload = await request('/top-headlines', {
        language: params.language || 'en',
        pageSize: String(params.pageSize || 50),
        q: params.q || ''
      });
      return (payload?.articles || []).map(normalize).filter((item) => item.title && item.url);
    },

    async getEverything(params = {}) {
      const payload = await request('/everything', {
        q: params.q || '',
        from: params.from || '',
        to: params.to || '',
        language: params.language || 'en',
        sortBy: 'publishedAt',
        pageSize: String(params.pageSize || 50)
      });
      return (payload?.articles || []).map(normalize).filter((item) => item.title && item.url);
    }
  };
};

module.exports = { createNewsApiAdapter };
