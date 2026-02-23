const express = require('express');
const { query } = require('../config/db');
const { badRequest, notFound } = require('../utils/errors');
const { createHorsaiV1Service } = require('../services/horsaiV1');

const UUID_RE = /^[0-9a-f-]{36}$/i;

const router = express.Router();
const service = createHorsaiV1Service({ query });

const parseDate = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest('date inválida (YYYY-MM-DD)', 'VALIDATION_ERROR');
  return text;
};

router.get('/brief/today', async (req, res, next) => {
  try {
    const date = service.nowInArtDate();
    const brief = await service.getBriefByDate({ userId: req.user.id, date });
    return res.json(brief);
  } catch (error) {
    return next(error);
  }
});

router.get('/brief/:date', async (req, res, next) => {
  try {
    const date = parseDate(req.params.date);
    const brief = await service.getBriefByDate({ userId: req.user.id, date });
    return res.json(brief);
  } catch (error) {
    return next(error);
  }
});

router.post('/brief/ask', async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) throw badRequest('prompt requerido', 'VALIDATION_ERROR');
    const date = service.nowInArtDate();
    const brief = await service.getBriefByDate({ userId: req.user.id, date });

    return res.json({
      answer: `We can explain today's context from the brief: ${brief.main_paragraph}`,
      context_bullets: Array.isArray(brief.bullets) ? brief.bullets.slice(0, 3) : [],
      note: 'We keep this answer explanatory only and avoid investment recommendations.'
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/ideas', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status).trim().toUpperCase() : '';
    if (status && !['ACTIVE', 'UNDER_REVIEW', 'CLOSED'].includes(status)) {
      throw badRequest('status inválido', 'VALIDATION_ERROR');
    }
    const items = await service.listIdeas({ userId: req.user.id, status: status || null });
    return res.json({ ideas: items });
  } catch (error) {
    return next(error);
  }
});

router.post('/ideas/analyze', async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) throw badRequest('prompt requerido', 'VALIDATION_ERROR');

    const out = await service.analyzePrompt({ userId: req.user.id, prompt });
    return res.status(201).json(out);
  } catch (error) {
    return next(error);
  }
});

router.post('/ideas/:id/review', async (req, res, next) => {
  try {
    const ideaId = String(req.params.id || '').trim();
    if (!UUID_RE.test(ideaId)) throw badRequest('id inválido', 'VALIDATION_ERROR');

    const idea = await service.reviewOneIdea({ userId: req.user.id, ideaId, manual: true });
    if (!idea) throw notFound('Idea no encontrada');
    return res.json(idea);
  } catch (error) {
    return next(error);
  }
});

router.post('/ideas/:id/close', async (req, res, next) => {
  try {
    const ideaId = String(req.params.id || '').trim();
    if (!UUID_RE.test(ideaId)) throw badRequest('id inválido', 'VALIDATION_ERROR');

    const reason = String(req.body?.reason || '').trim();
    const idea = await service.closeIdea({ userId: req.user.id, ideaId, reason });
    if (!idea) throw notFound('Idea no encontrada');
    return res.json(idea);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
