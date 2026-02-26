const express = require('express');
const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { query } = require('../config/db');
const { forbidden, serviceUnavailable } = require('../utils/errors');
const { createSourcesStatusService } = require('../services/sourcesStatus');

const router = express.Router();
const sourcesStatusService = createSourcesStatusService();

const ensureAuthorized = (req) => {
  const primary = String(env.adminJobToken || '').trim();
  const secondary = String(env.adminJobTokenNext || '').trim();
  if (!primary && !secondary) {
    throw serviceUnavailable('ADMIN_JOB_TOKEN no configurado', 'ADMIN_JOBS_DISABLED');
  }

  const provided = String(req.headers['x-admin-token'] || '').trim();
  const accepted = [primary, secondary].filter(Boolean);
  if (!provided || !accepted.includes(provided)) {
    throw forbidden('Token admin inválido', 'FORBIDDEN_ADMIN_JOBS');
  }
};

router.post('/run', async (req, res, next) => {
  try {
    ensureAuthorized(req);
    const date = req.body?.date || null;
    const runId = randomUUID();

    const ingestion = req.app?.locals?.marketIngestionService;
    const brief = req.app?.locals?.briefGenerator;
    const ideas = req.app?.locals?.ideasDailyPipeline;

    const out = {
      ingest_market_snapshots: ingestion?.ingestMarketSnapshots ? await ingestion.ingestMarketSnapshots({ date }) : { skipped: true },
      ingest_price_bars: ingestion?.ingestPriceBars ? await ingestion.ingestPriceBars({ date }) : { skipped: true },
      ingest_fundamentals: ingestion?.ingestFundamentals ? await ingestion.ingestFundamentals({ date }) : { skipped: true },
      ingest_earnings_calendar: ingestion?.ingestEarningsCalendar ? await ingestion.ingestEarningsCalendar({ date }) : { skipped: true },
      ingest_news: ingestion?.ingestNews ? await ingestion.ingestNews({ date }) : { skipped: true },
      ingest_news_backfill: ingestion?.ingestNewsBackfill ? await ingestion.ingestNewsBackfill({ date }) : { skipped: true },
      compute_relevance_scores: ingestion?.computeRelevanceScores ? await ingestion.computeRelevanceScores({ date }) : { skipped: true },
      brief: brief?.generateBrief ? await brief.generateBrief({ runId, date }) : { skipped: true },
      ideasReview: ideas?.reviewIdeas ? await ideas.reviewIdeas({ runId, runDate: date || null }) : { skipped: true },
      package: ideas?.generateDailyPackage ? await ideas.generateDailyPackage({ date, userId: req.user?.id || null }) : { skipped: true }
    };

    return res.json({ ok: true, runId, date: date || out?.package?.date || null, results: out });
  } catch (error) {
    return next(error);
  }
});

router.get('/status', async (req, res, next) => {
  try {
    ensureAuthorized(req);
    const cronStatus = req.app?.locals?.getCronStatus?.() || {};
    return res.json({ ok: true, cron: cronStatus, ts: new Date().toISOString() });
  } catch (error) {
    return next(error);
  }
});

router.get('/sources/status', async (req, res, next) => {
  try {
    ensureAuthorized(req);
    const out = await sourcesStatusService.getStatus();
    return res.json(out);
  } catch (error) {
    return next(error);
  }
});

router.post('/fix/news-titles', async (req, res, next) => {
  try {
    ensureAuthorized(req);
    if (!env.adminEnableDataFixes) {
      return res.status(404).json({ error: { code: 'DATA_FIX_DISABLED', message: 'Data fix endpoints disabled' } });
    }
    // TODO(v1.2): remove this temporary endpoint once upstream news ingest is stable.
    const sql = `
      WITH fixed AS (
        SELECT
          news_id,
          initcap(
            regexp_replace(
              regexp_replace(
                regexp_replace(split_part(url, '?', 1), '^.*/', ''),
                '\\.[a-z0-9]+$',
                '',
                'i'
              ),
              '[-_]+',
              ' ',
              'g'
            )
          ) AS derived_title
        FROM news_items
        WHERE url IS NOT NULL
      )
      UPDATE news_items n
      SET
        title = COALESCE(NULLIF(trim(f.derived_title), ''), n.title),
        headline = COALESCE(NULLIF(trim(f.derived_title), ''), n.headline)
      FROM fixed f
      WHERE n.news_id = f.news_id
        AND (
          lower(coalesce(n.title, '')) IN ('', 'untitled', '(untitled)', '[removed]', '[deleted]')
          OR lower(coalesce(n.headline, '')) IN ('', 'untitled', '(untitled)', '[removed]', '[deleted]')
        )`;

    const out = await query(sql);
    return res.json({ ok: true, updated: Number(out?.rowCount || 0) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
