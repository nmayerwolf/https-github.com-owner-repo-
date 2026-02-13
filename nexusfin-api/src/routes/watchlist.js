const express = require('express');
const { query } = require('../config/db');
const { badRequest } = require('../utils/errors');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await query('SELECT symbol, name, type, category, added_at FROM watchlist_items WHERE user_id = $1 ORDER BY added_at DESC', [
      req.user.id
    ]);
    return res.json({ symbols: rows.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { symbol, name, type, category } = req.body;
    if (!symbol || !name || !type || !category) throw badRequest('Faltan campos para watchlist');

    const count = await query('SELECT COUNT(*)::int AS total FROM watchlist_items WHERE user_id = $1', [req.user.id]);
    if (count.rows[0].total >= 50) return res.status(403).json({ error: 'LIMIT_REACHED', message: 'Máximo 50 símbolos' });

    const saved = await query(
      `INSERT INTO watchlist_items (user_id, symbol, name, type, category)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, symbol) DO NOTHING
       RETURNING symbol, name, type, category, added_at`,
      [req.user.id, symbol, name, type, category]
    );

    if (!saved.rows.length) return res.status(409).json({ error: 'ALREADY_EXISTS', message: 'Símbolo ya existente' });
    return res.status(201).json(saved.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.delete('/:symbol', async (req, res, next) => {
  try {
    await query('DELETE FROM watchlist_items WHERE user_id = $1 AND symbol = $2', [req.user.id, req.params.symbol]);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
