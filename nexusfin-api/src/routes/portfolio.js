const express = require('express');
const { query } = require('../config/db');
const { badRequest, forbidden, notFound } = require('../utils/errors');
const { validatePositiveNumber, sanitizeText } = require('../utils/validate');

const router = express.Router();
const SYMBOL_PATTERN = /^[A-Z0-9./:_-]{1,20}$/;

router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, symbol, name, category, buy_date, buy_price, quantity, sell_date, sell_price, notes, created_at
       FROM positions
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json({ positions: rows.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { symbol, name, category, buyDate, buyPrice, quantity, notes } = req.body;
    if (!symbol || !name || !category || !buyDate) throw badRequest('Faltan campos obligatorios');

    const normalizedSymbol = String(symbol).trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(normalizedSymbol)) throw badRequest('symbol inválido', 'VALIDATION_ERROR');

    const safeName = sanitizeText(name, { field: 'name', maxLen: 120, allowEmpty: false });
    const safeCategory = sanitizeText(category, { field: 'category', maxLen: 40, allowEmpty: false }).toLowerCase();
    const safeNotes = sanitizeText(notes, { field: 'notes', maxLen: 1000, allowEmpty: true }) || null;

    const count = await query('SELECT COUNT(*)::int AS total FROM positions WHERE user_id = $1 AND deleted_at IS NULL', [req.user.id]);
    if (count.rows[0].total >= 200) {
      return res.status(403).json({ error: 'LIMIT_REACHED', message: 'Máximo 200 posiciones' });
    }

    const row = await query(
      `INSERT INTO positions (user_id, symbol, name, category, buy_date, buy_price, quantity, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, symbol, name, category, buy_date, buy_price, quantity, sell_date, sell_price, notes, created_at`,
      [
        req.user.id,
        normalizedSymbol,
        safeName,
        safeCategory,
        buyDate,
        validatePositiveNumber(buyPrice, 'buyPrice'),
        validatePositiveNumber(quantity, 'quantity'),
        safeNotes
      ]
    );

    return res.status(201).json(row.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const current = await query('SELECT * FROM positions WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [req.params.id, req.user.id]);
    if (!current.rows.length) throw notFound('Posición no encontrada');

    const row = current.rows[0];
    const alreadySold = !!(row.sell_date || row.sell_price);
    if (alreadySold) {
      throw forbidden('No se puede editar una posición vendida', 'POSITION_SOLD');
    }

    const hasSellDate = req.body.sellDate !== undefined;
    const hasSellPrice = req.body.sellPrice !== undefined;
    if (hasSellDate !== hasSellPrice) {
      throw badRequest('Para vender se requieren sellDate y sellPrice juntos', 'VALIDATION_ERROR');
    }

    const next = {
      buyPrice: req.body.buyPrice ?? row.buy_price,
      quantity: req.body.quantity ?? row.quantity,
      notes: req.body.notes !== undefined ? sanitizeText(req.body.notes, { field: 'notes', maxLen: 1000, allowEmpty: true }) : row.notes,
      sellDate: hasSellDate ? req.body.sellDate : row.sell_date,
      sellPrice: hasSellPrice ? req.body.sellPrice : row.sell_price
    };

    const updated = await query(
      `UPDATE positions
       SET buy_price = $1, quantity = $2, notes = $3, sell_date = $4, sell_price = $5, updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING id, symbol, name, category, buy_date, buy_price, quantity, sell_date, sell_price, notes, created_at`,
      [
        validatePositiveNumber(next.buyPrice, 'buyPrice'),
        validatePositiveNumber(next.quantity, 'quantity'),
        next.notes,
        next.sellDate,
        next.sellPrice !== null && next.sellPrice !== undefined ? validatePositiveNumber(next.sellPrice, 'sellPrice') : null,
        req.params.id,
        req.user.id
      ]
    );

    return res.json(updated.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const gone = await query('UPDATE positions SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id', [
      req.params.id,
      req.user.id
    ]);
    if (!gone.rows.length) throw notFound('Posición no encontrada');
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
