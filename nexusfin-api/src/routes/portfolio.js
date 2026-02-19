const express = require('express');
const { query } = require('../config/db');
const { badRequest, forbidden, notFound } = require('../utils/errors');
const { validatePositiveNumber, sanitizeText } = require('../utils/validate');

const router = express.Router();
const SYMBOL_PATTERN = /^[A-Z0-9.^/_:-]{1,24}$/;
const PORTFOLIO_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const MAX_PORTFOLIOS = 3;
const MAX_HOLDINGS_PER_PORTFOLIO = 15;
const MAX_PORTFOLIO_USERS = 6;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const canWritePortfolio = (access = {}) => Boolean(access?.is_owner || String(access?.collaborator_role || '').toLowerCase() === 'editor');

const listPortfolios = async (userId) => {
  const rows = await query(
    `SELECT DISTINCT p.id, p.name, p.is_default, p.created_at, p.user_id AS owner_user_id,
      (p.user_id = $1) AS is_owner,
      (
        SELECT COUNT(*)::int
        FROM portfolio_collaborators pc2
        WHERE pc2.portfolio_id = p.id
      ) AS collaborator_count
     FROM portfolios p
     LEFT JOIN portfolio_collaborators pc ON pc.portfolio_id = p.id
     WHERE (p.user_id = $1 OR pc.user_id = $1) AND p.deleted_at IS NULL
     ORDER BY created_at ASC`,
    [userId]
  );
  return rows.rows;
};

const getOwnedPortfolio = async (userId, portfolioId) => {
  if (!PORTFOLIO_ID_PATTERN.test(String(portfolioId || ''))) {
    throw badRequest('portfolioId inválido', 'VALIDATION_ERROR');
  }
  const out = await query(
    `SELECT id, name, is_default, user_id AS owner_user_id
     FROM portfolios
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [portfolioId, userId]
  );
  if (!out.rows.length) throw notFound('Portfolio no encontrado');
  return out.rows[0];
};

const getAccessiblePortfolio = async (userId, portfolioId) => {
  if (!PORTFOLIO_ID_PATTERN.test(String(portfolioId || ''))) {
    throw badRequest('portfolioId inválido', 'VALIDATION_ERROR');
  }
  const out = await query(
    `SELECT DISTINCT p.id, p.name, p.user_id AS owner_user_id, (p.user_id = $2) AS is_owner, pc.role AS collaborator_role
     FROM portfolios p
     LEFT JOIN portfolio_collaborators pc ON pc.portfolio_id = p.id
     WHERE p.id = $1
       AND p.deleted_at IS NULL
       AND (p.user_id = $2 OR pc.user_id = $2)
     LIMIT 1`,
    [portfolioId, userId]
  );
  if (!out.rows.length) throw notFound('Portfolio no encontrado');
  return out.rows[0];
};

const getAccessiblePortfolioIds = async (userId) => {
  const rows = await query(
    `SELECT DISTINCT p.id
     FROM portfolios p
     LEFT JOIN portfolio_collaborators pc ON pc.portfolio_id = p.id
     WHERE p.deleted_at IS NULL
       AND (p.user_id = $1 OR pc.user_id = $1)`,
    [userId]
  );
  return rows.rows.map((row) => row.id);
};

router.get('/', async (req, res, next) => {
  try {
    const portfolios = await listPortfolios(req.user.id);
    const portfolioIds = portfolios.map((p) => p.id);
    if (!portfolioIds.length) return res.json({ positions: [], portfolios });

    const rows = await query(
      `SELECT id, portfolio_id, symbol, name, category, buy_date, buy_price, quantity, sell_date, sell_price, notes, created_at
       FROM positions
       WHERE portfolio_id = ANY($1::uuid[]) AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [portfolioIds]
    );
    return res.json({ positions: rows.rows, portfolios });
  } catch (error) {
    return next(error);
  }
});

router.get('/portfolios', async (req, res, next) => {
  try {
    const portfolios = await listPortfolios(req.user.id);
    return res.json({ portfolios });
  } catch (error) {
    return next(error);
  }
});

router.post('/portfolios', async (req, res, next) => {
  try {
    const safeName = sanitizeText(req.body?.name, { field: 'name', maxLen: 80, allowEmpty: false });

    const count = await query('SELECT COUNT(*)::int AS total FROM portfolios WHERE user_id = $1 AND deleted_at IS NULL', [req.user.id]);
    if (count.rows[0].total >= MAX_PORTFOLIOS) {
      return res.status(422).json({ error: { code: 'PORTFOLIO_LIMIT_REACHED', message: `Máximo ${MAX_PORTFOLIOS} portfolios` } });
    }

    const created = await query(
      `INSERT INTO portfolios (user_id, name, is_default)
       VALUES ($1, $2, FALSE)
       RETURNING id, name, is_default, created_at`,
      [req.user.id, safeName]
    );
    return res.status(201).json(created.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/portfolios/:id/invite', async (req, res, next) => {
  try {
    const owned = await getOwnedPortfolio(req.user.id, req.params.id);
    if (!owned) throw notFound('Portfolio no encontrado');
    const invitedEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(invitedEmail)) throw badRequest('email inválido', 'VALIDATION_ERROR');
    if (invitedEmail === String(req.user.email || '').toLowerCase()) {
      throw badRequest('No podés invitarte a vos mismo', 'VALIDATION_ERROR');
    }

    const participants = await query(
      `SELECT (1 + COUNT(*))::int AS total
       FROM portfolio_collaborators
       WHERE portfolio_id = $1`,
      [owned.id]
    );
    if (participants.rows[0].total >= MAX_PORTFOLIO_USERS) {
      return res.status(403).json({ error: { code: 'PORTFOLIO_USER_LIMIT', message: `Máximo ${MAX_PORTFOLIO_USERS} usuarios por portfolio` } });
    }

    const existingMember = await query(
      `SELECT 1 FROM users u
       JOIN portfolio_collaborators pc ON pc.user_id = u.id
       WHERE pc.portfolio_id = $1 AND LOWER(u.email) = $2
       LIMIT 1`,
      [owned.id, invitedEmail]
    );
    if (existingMember.rows.length) {
      return res.status(409).json({ error: { code: 'ALREADY_COLLABORATOR', message: 'El usuario ya participa en este portfolio' } });
    }

    const invitedUser = await query(`SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [invitedEmail]);
    const invitation = await query(
      `INSERT INTO portfolio_invitations (portfolio_id, invited_email, invited_user_id, invited_by, status)
       VALUES ($1,$2,$3,$4,'pending')
       ON CONFLICT (portfolio_id, invited_email) WHERE status = 'pending'
       DO UPDATE SET invited_by = EXCLUDED.invited_by, invited_user_id = EXCLUDED.invited_user_id, created_at = NOW()
       RETURNING id, portfolio_id, invited_email, status, created_at`,
      [owned.id, invitedEmail, invitedUser.rows[0]?.id || null, req.user.id]
    );
    return res.status(201).json(invitation.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.get('/invitations/received', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT i.id, i.portfolio_id, i.invited_email, i.status, i.created_at,
        p.name AS portfolio_name,
        owner.email AS invited_by_email
       FROM portfolio_invitations i
       JOIN portfolios p ON p.id = i.portfolio_id
       JOIN users owner ON owner.id = i.invited_by
       WHERE i.status = 'pending'
         AND p.deleted_at IS NULL
         AND (LOWER(i.invited_email) = LOWER($1) OR i.invited_user_id = $2)
       ORDER BY i.created_at DESC`,
      [req.user.email, req.user.id]
    );
    return res.json({ invitations: rows.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/invitations/:id/respond', async (req, res, next) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!['accept', 'decline'].includes(action)) throw badRequest('action inválida', 'VALIDATION_ERROR');

    const invite = await query(
      `SELECT i.id, i.portfolio_id, i.invited_email, i.status,
        p.user_id AS owner_user_id, p.deleted_at
       FROM portfolio_invitations i
       JOIN portfolios p ON p.id = i.portfolio_id
       WHERE i.id = $1
         AND i.status = 'pending'
         AND (LOWER(i.invited_email) = LOWER($2) OR i.invited_user_id = $3)
       LIMIT 1`,
      [req.params.id, req.user.email, req.user.id]
    );
    if (!invite.rows.length) throw notFound('Invitación no encontrada');
    const invitation = invite.rows[0];
    if (invitation.deleted_at) throw notFound('Portfolio no disponible');

    if (action === 'decline') {
      await query(
        `UPDATE portfolio_invitations
         SET status = 'declined', responded_at = NOW()
         WHERE id = $1`,
        [req.params.id]
      );
      return res.json({ ok: true, status: 'declined' });
    }

    const accessible = await getAccessiblePortfolioIds(req.user.id);
    if (accessible.length >= MAX_PORTFOLIOS) {
      return res.status(422).json({ error: { code: 'PORTFOLIO_LIMIT_REACHED', message: `Máximo ${MAX_PORTFOLIOS} portfolios por usuario` } });
    }

    const participants = await query(
      `SELECT (1 + COUNT(*))::int AS total
       FROM portfolio_collaborators
       WHERE portfolio_id = $1`,
      [invitation.portfolio_id]
    );
    if (participants.rows[0].total >= MAX_PORTFOLIO_USERS) {
      return res.status(403).json({ error: { code: 'PORTFOLIO_USER_LIMIT', message: `Máximo ${MAX_PORTFOLIO_USERS} usuarios por portfolio` } });
    }

    await query(
      `INSERT INTO portfolio_collaborators (portfolio_id, user_id, invited_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (portfolio_id, user_id) DO NOTHING`,
      [invitation.portfolio_id, req.user.id, invitation.owner_user_id]
    );

    await query(
      `UPDATE portfolio_invitations
       SET status = 'accepted', invited_user_id = $2, responded_at = NOW()
       WHERE id = $1`,
      [req.params.id, req.user.id]
    );

    return res.json({ ok: true, status: 'accepted' });
  } catch (error) {
    return next(error);
  }
});

router.patch('/portfolios/:id', async (req, res, next) => {
  try {
    await getOwnedPortfolio(req.user.id, req.params.id);
    const safeName = sanitizeText(req.body?.name, { field: 'name', maxLen: 80, allowEmpty: false });
    const updated = await query(
      `UPDATE portfolios
       SET name = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id, name, is_default, created_at`,
      [safeName, req.params.id, req.user.id]
    );
    return res.json(updated.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.delete('/portfolios/:id', async (req, res, next) => {
  try {
    await getOwnedPortfolio(req.user.id, req.params.id);

    await query(
      `UPDATE positions
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND portfolio_id = $2 AND deleted_at IS NULL`,
      [req.user.id, req.params.id]
    );

    await query(
      `UPDATE portfolios
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user.id]
    );
    await query(`UPDATE portfolio_invitations SET status = 'cancelled', responded_at = NOW() WHERE portfolio_id = $1 AND status = 'pending'`, [
      req.params.id
    ]);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { symbol, name, category, buyDate, buyPrice, quantity, notes, portfolioId } = req.body;
    if (!symbol || !name || !category || !buyDate) throw badRequest('Faltan campos obligatorios');

    const normalizedSymbol = String(symbol).trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(normalizedSymbol)) throw badRequest('symbol inválido', 'VALIDATION_ERROR');

    const safeName = sanitizeText(name, { field: 'name', maxLen: 120, allowEmpty: false });
    const safeCategory = sanitizeText(category, { field: 'category', maxLen: 40, allowEmpty: false }).toLowerCase();
    const safeNotes = sanitizeText(notes, { field: 'notes', maxLen: 1000, allowEmpty: true }) || null;

    if (!portfolioId) throw badRequest('portfolioId es obligatorio', 'VALIDATION_ERROR');
    const access = await getAccessiblePortfolio(req.user.id, portfolioId);
    if (!canWritePortfolio(access)) {
      throw forbidden('Permisos insuficientes para editar holdings', 'FORBIDDEN_PORTFOLIO_ACTION');
    }
    const targetPortfolioId = access.id;
    const count = await query(
      'SELECT COUNT(*)::int AS total FROM positions WHERE portfolio_id = $1 AND sell_date IS NULL AND deleted_at IS NULL',
      [targetPortfolioId]
    );
    if (count.rows[0].total >= MAX_HOLDINGS_PER_PORTFOLIO) {
      return res.status(422).json({
        error: {
          code: 'HOLDING_LIMIT_REACHED',
          message: `Máximo ${MAX_HOLDINGS_PER_PORTFOLIO} holdings por portfolio`
        }
      });
    }

    const row = await query(
      `INSERT INTO positions (user_id, portfolio_id, symbol, name, category, buy_date, buy_price, quantity, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, portfolio_id, symbol, name, category, buy_date, buy_price, quantity, sell_date, sell_price, notes, created_at`,
      [
        access.owner_user_id,
        targetPortfolioId,
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
    const current = await query(
      `SELECT pos.*, p.user_id AS owner_user_id, (p.user_id = $2) AS is_owner, pc.role AS collaborator_role
       FROM positions pos
       JOIN portfolios p ON p.id = pos.portfolio_id
       LEFT JOIN portfolio_collaborators pc ON pc.portfolio_id = p.id
       WHERE pos.id = $1
         AND pos.deleted_at IS NULL
         AND p.deleted_at IS NULL
         AND (p.user_id = $2 OR pc.user_id = $2)
       LIMIT 1`,
      [req.params.id, req.user.id]
    );
    if (!current.rows.length) throw notFound('Posición no encontrada');

    const row = current.rows[0];
    if (!canWritePortfolio(row)) {
      throw forbidden('Permisos insuficientes para editar holdings', 'FORBIDDEN_PORTFOLIO_ACTION');
    }
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
       WHERE id = $6
       RETURNING id, portfolio_id, symbol, name, category, buy_date, buy_price, quantity, sell_date, sell_price, notes, created_at`,
      [
        validatePositiveNumber(next.buyPrice, 'buyPrice'),
        validatePositiveNumber(next.quantity, 'quantity'),
        next.notes,
        next.sellDate,
        next.sellPrice !== null && next.sellPrice !== undefined ? validatePositiveNumber(next.sellPrice, 'sellPrice') : null,
        req.params.id
      ]
    );

    return res.json(updated.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const access = await query(
      `SELECT pos.id, p.user_id AS owner_user_id, (p.user_id = $2) AS is_owner, pc.role AS collaborator_role
       FROM positions pos
       JOIN portfolios p ON p.id = pos.portfolio_id
       LEFT JOIN portfolio_collaborators pc ON pc.portfolio_id = p.id
       WHERE pos.id = $1
         AND pos.deleted_at IS NULL
         AND p.deleted_at IS NULL
         AND (p.user_id = $2 OR pc.user_id = $2)
       LIMIT 1`,
      [req.params.id, req.user.id]
    );
    if (!access.rows.length) throw notFound('Posición no encontrada');
    if (!canWritePortfolio(access.rows[0])) {
      throw forbidden('Permisos insuficientes para editar holdings', 'FORBIDDEN_PORTFOLIO_ACTION');
    }

    const gone = await query(
      `UPDATE positions
       SET deleted_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id]
    );
    if (!gone.rows.length) throw notFound('Posición no encontrada');
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
