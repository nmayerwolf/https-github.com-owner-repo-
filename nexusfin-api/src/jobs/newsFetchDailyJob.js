const crypto = require('crypto');
const { query } = require('../config/db');
const finnhub = require('../services/finnhub');
const { withTrackedJobRun } = require('../services/jobRunTracker');

const normalizeNews = (items = [], category = 'general') =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      const headline = String(item?.headline || '').trim();
      const url = String(item?.url || '').trim();
      if (!headline) return null;
      const ts = Number(item?.datetime || 0) > 0 ? new Date(Number(item.datetime) * 1000).toISOString() : new Date().toISOString();
      const idBase = url || `${headline}-${item?.datetime || ''}-${category}`;
      const id = `news-${crypto.createHash('sha256').update(idBase).digest('hex').slice(0, 24)}`;
      return {
        id,
        ts,
        source: String(item?.source || '').trim() || null,
        headline: headline.slice(0, 500),
        summary: String(item?.summary || '').trim().slice(0, 3500) || null,
        tags: [category],
        tickers: Array.isArray(item?.related) ? item.related.map((x) => String(x || '').toUpperCase()).slice(0, 20) : [],
        url: url || null,
        raw: item && typeof item === 'object' ? item : {}
      };
    })
    .filter(Boolean);

const runCore = async () => {
  const categories = ['general', 'forex', 'crypto'];
  const all = [];
  for (const category of categories) {
    const rows = await finnhub.generalNews(category, 0).catch(() => []);
    all.push(...normalizeNews(rows, category));
  }

  const dedupMap = new Map();
  for (const item of all) {
    const key = item.url || `${item.headline}:${item.ts}`;
    if (!dedupMap.has(key)) dedupMap.set(key, item);
  }
  const finalRows = [...dedupMap.values()].slice(0, 100);

  let inserted = 0;
  for (const row of finalRows) {
    await query(
      `INSERT INTO news_items (id, ts, source, headline, summary, tags, tickers, url, raw, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9::jsonb,NOW())
       ON CONFLICT (id)
       DO UPDATE SET
         ts = EXCLUDED.ts,
         source = EXCLUDED.source,
         headline = EXCLUDED.headline,
         summary = EXCLUDED.summary,
         tags = EXCLUDED.tags,
         tickers = EXCLUDED.tickers,
         url = EXCLUDED.url,
         raw = EXCLUDED.raw,
         fetched_at = NOW()`,
      [row.id, row.ts, row.source, row.headline, row.summary, JSON.stringify(row.tags || []), JSON.stringify(row.tickers || []), row.url, JSON.stringify(row.raw || {})]
    );
    inserted += 1;
  }

  return { generated: inserted, inserted, categories: categories.length };
};

const run = async () =>
  withTrackedJobRun({
    query,
    jobName: 'news_fetch_daily',
    run: runCore
  });

module.exports = { run, runCore };
