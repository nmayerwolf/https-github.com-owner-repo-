const express = require('express');
const { query } = require('../config/db');

const router = express.Router();

const defaultPayload = {
  isActive: false,
  title: null,
  summary: null,
  learnMore: null
};

router.get('/today', async (_req, res, next) => {
  try {
    const out = await query(
      `SELECT is_active, title, summary, triggers, what_changed
       FROM crisis_state
       WHERE COALESCE(state_date, date) = CURRENT_DATE
       LIMIT 1`
    );

    const row = out.rows?.[0];
    if (!row) return res.json(defaultPayload);

    const isActive = Boolean(row.is_active);
    if (!isActive) return res.json(defaultPayload);

    return res.json({
      isActive: true,
      title: row.title || 'Elevated Market Volatility',
      summary: row.summary || null,
      learnMore: {
        triggers: Array.isArray(row.triggers) ? row.triggers : [],
        whatChanged: Array.isArray(row.what_changed) ? row.what_changed : []
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
