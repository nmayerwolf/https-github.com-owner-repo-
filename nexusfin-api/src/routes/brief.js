const express = require('express');

const router = express.Router();

const ensureService = (req) => req.app?.locals?.briefGenerator;

router.get('/today', async (req, res, next) => {
  try {
    const service = ensureService(req);
    if (!service?.getBrief) return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
    const brief = await service.getBrief({});
    return res.json(brief);
  } catch (error) {
    return next(error);
  }
});

router.get('/:date', async (req, res, next) => {
  try {
    const service = ensureService(req);
    if (!service?.getBrief) return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
    const brief = await service.getBrief({ date: req.params.date });
    return res.json(brief);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
