const express = require('express');
const { badRequest } = require('../utils/errors');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const service = req.app?.locals?.portfolioEngine;
    if (!service?.getSnapshot) return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
    const out = await service.getSnapshot({ userId: req.user.id, date: req.query?.date || null });
    return res.json(out);
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const service = req.app?.locals?.portfolioEngine;
    if (!service?.upsertHoldings) return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
    const holdings = Array.isArray(req.body?.holdings) ? req.body.holdings : [];
    const out = await service.upsertHoldings({ userId: req.user.id, holdings, asOfDate: req.body?.date || null });
    return res.json({ ok: true, ...out });
  } catch (error) {
    return next(error);
  }
});

router.post('/holdings', async (req, res, next) => {
  try {
    const service = req.app?.locals?.portfolioEngine;
    if (!service?.upsertHoldings) return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
    const holdings = Array.isArray(req.body?.holdings) ? req.body.holdings : [req.body];
    if (!holdings.length) throw badRequest('holdings es obligatorio', 'VALIDATION_ERROR');

    const out = await service.upsertHoldings({ userId: req.user.id, holdings, asOfDate: req.body?.date || null });
    return res.json({ ok: true, ...out });
  } catch (error) {
    return next(error);
  }
});

router.get('/challenges', async (req, res, next) => {
  try {
    const service = req.app?.locals?.portfolioEngine;
    if (!service?.getChallenges) return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
    const out = await service.getChallenges({ userId: req.user.id, date: req.query?.date || null });
    return res.json({ challenges: out });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
