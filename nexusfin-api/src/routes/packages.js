const express = require('express');

const router = express.Router();

const runLoad = async (req, date) => {
  const pipeline = req.app?.locals?.ideasDailyPipeline;
  if (!pipeline?.generateDailyPackage) return null;
  return pipeline.generateDailyPackage({ date, userId: req.user?.id || null });
};

router.get('/today', async (req, res, next) => {
  try {
    const out = await runLoad(req, null);
    if (!out) return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
    return res.json(out);
  } catch (error) {
    return next(error);
  }
});

router.get('/:date', async (req, res, next) => {
  try {
    const out = await runLoad(req, req.params.date);
    if (!out) return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
    return res.json(out);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
