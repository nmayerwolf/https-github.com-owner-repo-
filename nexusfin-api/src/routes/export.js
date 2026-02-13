const express = require('express');
const { query } = require('../config/db');
const { badRequest } = require('../utils/errors');

const router = express.Router();

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const escapeCsv = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const parseFilter = (value) => {
  const normalized = String(value || 'all').toLowerCase();
  if (['all', 'active', 'sold'].includes(normalized)) return normalized;
  throw badRequest('filter inválido. Usá all, active o sold', 'VALIDATION_ERROR');
};

const buildWhereByFilter = (filter) => {
  if (filter === 'active') return 'AND sell_date IS NULL';
  if (filter === 'sold') return 'AND sell_date IS NOT NULL';
  return '';
};

router.get('/portfolio', async (req, res, next) => {
  try {
    const format = String(req.query.format || '').toLowerCase();
    if (format !== 'csv') {
      throw badRequest('Formato no soportado. Usá format=csv', 'VALIDATION_ERROR');
    }

    const filter = parseFilter(req.query.filter);
    const whereByFilter = buildWhereByFilter(filter);

    const out = await query(
      `
      SELECT symbol, name, category, buy_date, buy_price, quantity, sell_date, sell_price, notes
      FROM positions
      WHERE user_id = $1
        AND deleted_at IS NULL
        ${whereByFilter}
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    const headers = [
      'Symbol',
      'Name',
      'Category',
      'Buy Date',
      'Buy Price',
      'Quantity',
      'Sell Date',
      'Sell Price',
      'P&L %',
      'Notes'
    ];

    const rows = out.rows.map((row) => {
      const buyPrice = Number(row.buy_price);
      const sellPrice = row.sell_price === null || row.sell_price === undefined ? null : Number(row.sell_price);
      const pnlPct = sellPrice !== null && buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : null;

      return [
        row.symbol,
        row.name,
        row.category,
        formatDate(row.buy_date),
        Number.isFinite(buyPrice) ? buyPrice.toFixed(4) : '',
        Number.isFinite(Number(row.quantity)) ? Number(row.quantity).toString() : '',
        formatDate(row.sell_date),
        sellPrice !== null && Number.isFinite(sellPrice) ? sellPrice.toFixed(4) : '',
        pnlPct !== null ? `${pnlPct.toFixed(2)}%` : '',
        row.notes || ''
      ];
    });

    const csv = [headers, ...rows].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const filename = `nexusfin-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
