const express = require('express');
const { query } = require('../config/db');
const { badRequest } = require('../utils/errors');

const router = express.Router();

const safeQuery = async (sql, params = [], fallback = { rows: [] }) => {
  try {
    return await query(sql, params);
  } catch {
    return fallback;
  }
};

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
    const theme = req.query.theme ? String(req.query.theme).trim() : null;
    const action = req.query.action ? String(req.query.action).trim().toLowerCase() : null;

    const filters = [];
    const params = [];
    if (status) {
      params.push(status);
      filters.push(`i.status = $${params.length}`);
    }
    if (action) {
      params.push(action);
      filters.push(`i.action = $${params.length}`);
    }
    if (theme) {
      params.push(theme);
      filters.push(`EXISTS (SELECT 1 FROM idea_themes it JOIN themes_v2 t ON t.id = it.theme_id WHERE it.idea_id = i.id AND t.name = $${params.length})`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const out = await safeQuery(
      `SELECT i.id, i.title, i.summary, i.action, i.horizon, i.horizon_value, i.status, i.risk, i.conviction_score,
              i.thesis, i.risks, i.catalysts, i.validation, i.valuation, i.created_at, i.updated_at
       FROM ideas i
       ${whereSql}
       ORDER BY COALESCE(i.updated_at, i.created_at) DESC
       LIMIT 200`,
      params
    );

    return res.json({ ideas: out.rows || [] });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const out = await safeQuery(
      `SELECT i.*, COALESCE(jsonb_agg(jsonb_build_object('asset_id', ins.asset_id, 'role', ins.role, 'direction', ins.direction, 'entry', ins.entry, 'exits', ins.exits, 'sizing', ins.sizing)) FILTER (WHERE ins.id IS NOT NULL), '[]'::jsonb) AS instruments
       FROM ideas i
       LEFT JOIN idea_instruments ins ON ins.idea_id = i.id
       WHERE i.id = $1
       GROUP BY i.id
       LIMIT 1`,
      [req.params.id]
    );
    if (!out.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    return res.json(out.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/analyze', async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) throw badRequest('prompt es obligatorio', 'VALIDATION_ERROR');
    const pipeline = req.app?.locals?.ideasDailyPipeline;
    if (!pipeline?.analyzePrompt) return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });

    const out = await pipeline.analyzePrompt({
      prompt,
      userId: req.user?.id || null,
      tenantId: req.body?.tenantId || null
    });

    return res.status(201).json(out);
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/review', async (req, res, next) => {
  try {
    const pipeline = req.app?.locals?.ideasDailyPipeline;
    if (!pipeline?.reviewIdeas) return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
    const result = await pipeline.reviewIdeas({ date: req.body?.date || null });
    return res.json({ ok: true, ideaId: req.params.id, review: result });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/close', async (req, res, next) => {
  try {
    const out = await safeQuery(
      `UPDATE ideas
       SET status = 'closed', updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, updated_at`,
      [req.params.id]
    );
    if (!out.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    return res.json(out.rows[0]);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
