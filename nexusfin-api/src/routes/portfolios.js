const express = require('express');
const { query } = require('../config/db');
const { badRequest, conflict, forbidden, notFound } = require('../utils/errors');

const router = express.Router();

const PORTFOLIO_ID_RE = /^[0-9a-f-]{36}$/i;
const MAX_PORTFOLIOS = 3;
const MAX_HOLDINGS = 15;

const toPortfolioId = (value) => {
  const safe = String(value || '').trim();
  if (!PORTFOLIO_ID_RE.test(safe)) throw badRequest('portfolio id inválido', 'VALIDATION_ERROR');
  return safe;
};

const canEdit = (access) => access && (access.role === 'owner' || access.role === 'editor');

const getAccess = async (portfolioId, userId) => {
  const out = await query(
    `SELECT p.id, p.user_id AS owner_user_id, p.name, p.currency, p.created_at,
            CASE
              WHEN p.user_id = $2 THEN 'owner'
              ELSE COALESCE(pc.role, 'viewer')
            END AS role
     FROM portfolios p
     LEFT JOIN portfolio_collaborators pc
       ON pc.portfolio_id = p.id AND pc.user_id = $2
     WHERE p.id = $1
       AND p.deleted_at IS NULL
       AND (p.user_id = $2 OR pc.user_id IS NOT NULL)
     LIMIT 1`,
    [portfolioId, userId]
  );

  if (!out.rows.length) throw notFound('Portfolio no encontrado');
  return out.rows[0];
};

const latestSnapshotFor = async (portfolioId) => {
  const out = await query(
    `SELECT s.date AS snapshot_date, s.total_value, s.pnl_day, s.pnl_total, s.benchmark_ret,
            m.alignment_score, m.sector_exposure, m.concentration, m.ai_notes
     FROM portfolio_snapshots s
     LEFT JOIN portfolio_metrics m
       ON m.portfolio_id = s.portfolio_id AND m.date = s.date
     WHERE s.portfolio_id = $1
     ORDER BY s.date DESC
     LIMIT 1`,
    [portfolioId]
  );
  return out.rows[0] || null;
};

const listHoldings = async (portfolioId) => {
  const out = await query(
    `SELECT symbol, quantity AS qty, buy_price AS avg_cost, category, name, COALESCE(source, 'manual') AS source
     FROM positions
     WHERE portfolio_id = $1 AND sell_date IS NULL AND deleted_at IS NULL
     ORDER BY symbol ASC`,
    [portfolioId]
  );
  return out.rows;
};

router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const currency = String(req.body?.currency || 'USD').trim().toUpperCase();

    if (!name) throw badRequest('name requerido', 'VALIDATION_ERROR');

    const count = await query(
      `SELECT COUNT(*)::int AS total
       FROM portfolios p
       LEFT JOIN portfolio_collaborators pc ON pc.portfolio_id = p.id
       WHERE p.deleted_at IS NULL
         AND (p.user_id = $1 OR pc.user_id = $1)`,
      [req.user.id]
    );

    if (Number(count.rows[0]?.total || 0) >= MAX_PORTFOLIOS) {
      return res.status(422).json({
        error: {
          code: 'PORTFOLIO_LIMIT_REACHED',
          message: `Máximo ${MAX_PORTFOLIOS} portfolios por usuario`,
          details: { limit: MAX_PORTFOLIOS, attempted: Number(count.rows[0]?.total || 0) + 1 }
        }
      });
    }

    const out = await query(
      `INSERT INTO portfolios (user_id, name, currency, is_default)
       VALUES ($1, $2, $3, FALSE)
       RETURNING id, name, currency, created_at`,
      [req.user.id, name.slice(0, 80), currency.slice(0, 8)]
    );

    return res.status(201).json({
      id: out.rows[0].id,
      name: out.rows[0].name,
      currency: out.rows[0].currency,
      role: 'owner',
      createdAt: out.rows[0].created_at
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const out = await query(
      `SELECT p.id, p.name, p.currency, p.created_at,
              CASE
                WHEN p.user_id = $1 THEN 'owner'
                ELSE COALESCE(pc.role, 'viewer')
              END AS role
       FROM portfolios p
       LEFT JOIN portfolio_collaborators pc ON pc.portfolio_id = p.id AND pc.user_id = $1
       WHERE p.deleted_at IS NULL
         AND (p.user_id = $1 OR pc.user_id IS NOT NULL)
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    return res.json({ portfolios: out.rows.map((row) => ({
      id: row.id,
      name: row.name,
      currency: row.currency || 'USD',
      role: row.role,
      createdAt: row.created_at
    })) });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const portfolioId = toPortfolioId(req.params.id);
    const access = await getAccess(portfolioId, req.user.id);
    const [holdings, latest] = await Promise.all([listHoldings(portfolioId), latestSnapshotFor(portfolioId)]);

    return res.json({
      id: access.id,
      name: access.name,
      currency: access.currency || 'USD',
      role: access.role,
      holdings,
      latestSnapshot: latest
        ? {
            date: latest.snapshot_date,
            totalValue: Number(latest.total_value || 0),
            pnlDay: Number(latest.pnl_day || 0),
            pnlTotal: Number(latest.pnl_total || 0),
            benchmarkRet: Number(latest.benchmark_ret || 0)
          }
        : null,
      benchmarkCompare: latest
        ? {
            symbol: 'SPY',
            return: Number(latest.benchmark_ret || 0)
          }
        : null,
      alignmentScore: latest?.alignment_score == null ? null : Number(latest.alignment_score),
      exposures: latest?.sector_exposure || {},
      concentration: latest?.concentration || {},
      aiNotes: latest?.ai_notes || null
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id/holdings', async (req, res, next) => {
  try {
    const portfolioId = toPortfolioId(req.params.id);
    const access = await getAccess(portfolioId, req.user.id);
    if (!canEdit(access)) throw forbidden('Permisos insuficientes para editar holdings', 'FORBIDDEN_PORTFOLIO_ACTION');

    const holdings = Array.isArray(req.body?.holdings) ? req.body.holdings : null;
    if (!holdings) throw badRequest('holdings debe ser un array', 'VALIDATION_ERROR');
    if (holdings.length > MAX_HOLDINGS) {
      return res.status(422).json({
        error: {
          code: 'HOLDING_LIMIT_REACHED',
          message: `Máximo ${MAX_HOLDINGS} holdings por portfolio`,
          details: { limit: MAX_HOLDINGS, attempted: holdings.length }
        }
      });
    }

    const seen = new Set();
    for (const item of holdings) {
      const symbol = String(item?.symbol || '').trim().toUpperCase();
      if (!symbol) continue;
      if (seen.has(symbol)) {
        throw conflict(`Holding duplicado para ${symbol}`, 'DUPLICATE_HOLDING', { symbol });
      }
      seen.add(symbol);
    }

    await query('UPDATE positions SET deleted_at = NOW() WHERE portfolio_id = $1 AND sell_date IS NULL AND deleted_at IS NULL', [portfolioId]);

    for (const item of holdings) {
      const symbol = String(item?.symbol || '').trim().toUpperCase();
      const qty = Number(item?.qty);
      const avgCost = Number(item?.avg_cost);
      const source = String(item?.source || 'manual').trim().toLowerCase() === 'reco' ? 'reco' : 'manual';

      if (!symbol) throw badRequest('holding.symbol requerido', 'VALIDATION_ERROR');
      if (!Number.isFinite(qty) || qty <= 0) throw badRequest('holding.qty inválido', 'VALIDATION_ERROR');
      if (!Number.isFinite(avgCost) || avgCost <= 0) throw badRequest('holding.avg_cost inválido', 'VALIDATION_ERROR');

      await query(
        `INSERT INTO positions (user_id, portfolio_id, symbol, name, category, buy_date, buy_price, quantity, notes, source)
         VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6,$7,'',$8)`,
        [access.owner_user_id, portfolioId, symbol, item?.name ? String(item.name).slice(0, 100) : symbol, 'equity', avgCost, qty, source]
      );
    }

    const nextHoldings = await listHoldings(portfolioId);
    return res.json({ portfolioId, holdings: nextHoldings });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/invite', async (_req, res) => {
  return res.status(410).json({ error: { code: 'FEATURE_REMOVED', message: 'Compartir portfolio fue removido.' } });
});

router.post('/:id/accept', async (_req, res) => {
  return res.status(410).json({ error: { code: 'FEATURE_REMOVED', message: 'Compartir portfolio fue removido.' } });
});

module.exports = router;
