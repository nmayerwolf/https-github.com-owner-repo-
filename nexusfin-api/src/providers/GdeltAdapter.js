const { withTimeout, ensureOk } = require('./httpClient');

const BASE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';

const isoOrNow = (value) => {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? new Date(ts).toISOString() : new Date().toISOString();
};

const createGdeltAdapter = ({ fetchImpl = global.fetch, baseUrl = BASE_URL, timeoutMs = 12000 } = {}) => {
  const request = async (params = {}) => {
    if (!fetchImpl) throw new Error('Missing fetch implementation');

    const qs = new URLSearchParams({
      format: 'json',
      mode: 'ArtList',
      maxrecords: String(params.limit || 50),
      sort: 'DateDesc',
      query: params.query || ''
    });

    if (params.from && params.to) {
      qs.set('startdatetime', String(params.from).replace(/[-:]/g, '').replace('T', '').slice(0, 14));
      qs.set('enddatetime', String(params.to).replace(/[-:]/g, '').replace('T', '').slice(0, 14));
    }

    const url = `${baseUrl}?${qs.toString()}`;
    const res = await withTimeout(fetchImpl, url, {}, timeoutMs);
    await ensureOk(res, 'GDELT');
    return res.json();
  };

  return {
    vendor: 'gdelt',

    async getSignals(params = {}) {
      const payload = await request(params);
      const rows = Array.isArray(payload?.articles) ? payload.articles : [];
      return rows
        .map((row) => ({
          ts: isoOrNow(row?.seendate || row?.socialimage),
          title: String(row?.title || '').trim(),
          description: String(row?.seendate || '').trim() || undefined,
          sourceName: String(row?.sourcecountry || row?.domain || 'GDELT').trim(),
          url: String(row?.url || '').trim(),
          imageUrl: String(row?.socialimage || '').trim() || undefined,
          language: 'en',
          sources: [{ vendor: 'gdelt', url: String(row?.url || '').trim() }]
        }))
        .filter((item) => item.title && item.url);
    }
  };
};

module.exports = { createGdeltAdapter };
