const express = require('express');
const { query } = require('../config/db');
const { badRequest, forbidden, notFound } = require('../utils/errors');
const { generateUniqueGroupCode } = require('../services/groupCode');
const finnhub = require('../services/finnhub');
const { sanitizeText } = require('../utils/validate');

const router = express.Router();

const MAX_GROUPS_PER_USER = 5;
const MAX_MEMBERS_PER_GROUP = 20;
const GROUP_CODE_PATTERN = /^NXF-[A-Z0-9]{5}$/;

const memberRole = async (groupId, userId) => {
  const found = await query('SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  return found.rows[0]?.role || null;
};

const memberRecord = async (groupId, userId) => {
  const found = await query('SELECT user_id, role FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  return found.rows[0] || null;
};

const userGroupCount = async (userId) => {
  const out = await query('SELECT COUNT(*)::int AS total FROM group_members WHERE user_id = $1', [userId]);
  return Number(out.rows[0]?.total || 0);
};

const groupMemberCount = async (groupId) => {
  const out = await query('SELECT COUNT(*)::int AS total FROM group_members WHERE group_id = $1', [groupId]);
  return Number(out.rows[0]?.total || 0);
};

const parseQuotePrice = (quote) => {
  const price = Number(quote?.c);
  return Number.isFinite(price) && price > 0 ? price : null;
};

const calcPLPercent = (buyPrice, currentPrice) => {
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) return null;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  return ((currentPrice - buyPrice) / buyPrice) * 100;
};

const getQuotePrice = async (symbol, quoteCache) => {
  if (quoteCache.has(symbol)) return quoteCache.get(symbol);

  try {
    const price = parseQuotePrice(await finnhub.quote(symbol));
    quoteCache.set(symbol, price);
    return price;
  } catch {
    quoteCache.set(symbol, null);
    return null;
  }
};

router.post('/', async (req, res, next) => {
  try {
    const name = sanitizeText(req.body.name, { field: 'Nombre', maxLen: 80, allowEmpty: false });

    const myGroups = await userGroupCount(req.user.id);
    if (myGroups >= MAX_GROUPS_PER_USER) {
      throw forbidden(`Máximo ${MAX_GROUPS_PER_USER} grupos por usuario`, 'GROUP_LIMIT_REACHED');
    }

    const code = await generateUniqueGroupCode();
    const created = await query('INSERT INTO groups (name, code, created_by) VALUES ($1,$2,$3) RETURNING id, name, code', [
      name,
      code,
      req.user.id
    ]);

    await query('INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,\'admin\')', [created.rows[0].id, req.user.id]);

    return res.status(201).json({ ...created.rows[0], role: 'admin', members: 1 });
  } catch (error) {
    return next(error);
  }
});

router.post('/join', async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!GROUP_CODE_PATTERN.test(code)) {
      throw badRequest('Código de invitación inválido', 'VALIDATION_ERROR');
    }
    const group = await query('SELECT id, name, code FROM groups WHERE code = $1', [code]);
    if (!group.rows.length) return res.status(404).json({ error: { code: 'GROUP_NOT_FOUND', message: 'Código de invitación inválido' } });

    const exists = await query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [group.rows[0].id, req.user.id]);
    if (exists.rows.length) return res.status(409).json({ error: { code: 'ALREADY_MEMBER', message: 'Ya sos miembro de este grupo' } });

    const myGroups = await userGroupCount(req.user.id);
    if (myGroups >= MAX_GROUPS_PER_USER) {
      throw forbidden(`Máximo ${MAX_GROUPS_PER_USER} grupos por usuario`, 'GROUP_LIMIT_REACHED');
    }

    const members = await groupMemberCount(group.rows[0].id);
    if (members >= MAX_MEMBERS_PER_GROUP) {
      throw forbidden(`El grupo alcanzó el máximo de ${MAX_MEMBERS_PER_GROUP} miembros`, 'GROUP_MEMBER_LIMIT_REACHED');
    }

    await query('INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,\'member\')', [group.rows[0].id, req.user.id]);
    const total = await groupMemberCount(group.rows[0].id);

    return res.json({ ...group.rows[0], role: 'member', members: total });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT g.id, g.name, g.code, gm.role,
        (SELECT COUNT(*)::int FROM group_members x WHERE x.group_id = g.id) AS members
       FROM group_members gm
       JOIN groups g ON g.id = gm.group_id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    return res.json({ groups: rows.rows });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const role = await memberRole(req.params.id, req.user.id);
    if (!role) throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');
    if (role !== 'admin') throw forbidden('Solo admin puede editar el grupo', 'ADMIN_ONLY');

    const name = sanitizeText(req.body.name, { field: 'Nombre', maxLen: 80, allowEmpty: false });

    const updated = await query('UPDATE groups SET name = $1 WHERE id = $2 RETURNING id, name, code', [name, req.params.id]);
    if (!updated.rows.length) throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');

    const members = await groupMemberCount(req.params.id);
    return res.json({ ...updated.rows[0], role: 'admin', members });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const role = await memberRole(req.params.id, req.user.id);
    if (!role) throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');

    const group = await query('SELECT id, name, code FROM groups WHERE id = $1', [req.params.id]);
    const members = await query(
      `SELECT gm.user_id, gm.role, gm.joined_at, COALESCE(u.display_name, split_part(u.email, '@', 1)) AS display_name
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at ASC`,
      [req.params.id]
    );

    const quoteCache = new Map();
    const payloadMembers = [];

    for (const m of members.rows) {
      const positions = await query(
        `SELECT symbol, category, quantity, buy_price
         FROM positions
         WHERE user_id = $1 AND deleted_at IS NULL AND sell_date IS NULL`,
        [m.user_id]
      );

      const payloadPositions = [];
      for (const p of positions.rows) {
        const buyPrice = Number(p.buy_price);
        const currentPrice = await getQuotePrice(p.symbol, quoteCache);

        payloadPositions.push({
          symbol: p.symbol,
          category: p.category,
          quantity: Number(p.quantity),
          plPercent: calcPLPercent(buyPrice, currentPrice)
        });
      }

      payloadMembers.push({
        userId: m.user_id,
        displayName: m.display_name,
        role: m.role,
        positions: payloadPositions
      });
    }

    return res.json({ ...group.rows[0], role, memberCount: members.rows.length, members: payloadMembers });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const role = await memberRole(req.params.id, req.user.id);
    if (!role) throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');
    if (role !== 'admin') throw forbidden('Solo admin puede eliminar el grupo', 'ADMIN_ONLY');

    await query('DELETE FROM groups WHERE id = $1', [req.params.id]);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const requesterRole = await memberRole(req.params.id, req.user.id);
    if (!requesterRole) throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');
    if (requesterRole !== 'admin') throw forbidden('Solo admin puede eliminar miembros', 'ADMIN_ONLY');

    if (req.params.userId === req.user.id) {
      throw badRequest('Usá la acción salir del grupo para tu propio usuario', 'USE_LEAVE_FOR_SELF');
    }

    const target = await memberRecord(req.params.id, req.params.userId);
    if (!target) throw notFound('Miembro no encontrado', 'GROUP_MEMBER_NOT_FOUND');

    if (target.role === 'admin') {
      throw forbidden('No se puede eliminar a un admin del grupo', 'CANNOT_REMOVE_ADMIN');
    }

    await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id/leave', async (req, res, next) => {
  try {
    const role = await memberRole(req.params.id, req.user.id);
    if (!role) throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');

    await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.id, req.user.id]);

    const left = await query('SELECT user_id, role FROM group_members WHERE group_id = $1 ORDER BY joined_at ASC', [req.params.id]);
    if (!left.rows.length) {
      await query('DELETE FROM groups WHERE id = $1', [req.params.id]);
      return res.status(204).end();
    }

    const hasAdmin = left.rows.some((x) => x.role === 'admin');
    if (!hasAdmin) {
      await query("UPDATE group_members SET role = 'admin' WHERE group_id = $1 AND user_id = $2", [req.params.id, left.rows[0].user_id]);
    }

    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});


router.get('/:id/feed', async (req, res, next) => {
  try {
    const role = await memberRole(req.params.id, req.user.id);
    if (!role) throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const offset = (page - 1) * limit;

    const events = await query(
      `SELECT ge.id, ge.type, ge.user_id, ge.data, ge.created_at,
              COALESCE(u.display_name, split_part(u.email, '@', 1)) AS display_name
       FROM group_events ge
       JOIN users u ON u.id = ge.user_id
       WHERE ge.group_id = $1
       ORDER BY ge.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );

    const totalOut = await query('SELECT COUNT(*)::int AS total FROM group_events WHERE group_id = $1', [req.params.id]);

    const payload = [];
    for (const e of events.rows) {
      const reactionRows = await query(
        `SELECT reaction, COUNT(*)::int AS total
         FROM event_reactions
         WHERE event_id = $1
         GROUP BY reaction`,
        [e.id]
      );

      const mine = await query('SELECT reaction FROM event_reactions WHERE event_id = $1 AND user_id = $2', [e.id, req.user.id]);

      const reactions = { agree: 0, disagree: 0, userReaction: mine.rows[0]?.reaction || null };
      for (const r of reactionRows.rows) reactions[r.reaction] = Number(r.total || 0);

      payload.push({
        id: e.id,
        type: e.type,
        userId: e.user_id,
        displayName: e.display_name,
        data: e.data || {},
        reactions,
        createdAt: e.created_at
      });
    }

    return res.json({
      events: payload,
      pagination: {
        page,
        limit,
        total: Number(totalOut.rows[0]?.total || 0)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/feed', async (req, res, next) => {
  try {
    const role = await memberRole(req.params.id, req.user.id);
    if (!role) throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');

    const message = sanitizeText(req.body?.message, { field: 'message', maxLen: 280, allowEmpty: false });

    const created = await query(
      `INSERT INTO group_events (group_id, user_id, type, data)
       VALUES ($1, $2, 'note', $3::jsonb)
       RETURNING id, type, user_id, data, created_at`,
      [req.params.id, req.user.id, JSON.stringify({ message })]
    );

    const userOut = await query("SELECT COALESCE(display_name, split_part(email, '@', 1)) AS display_name FROM users WHERE id = $1", [
      req.user.id
    ]);

    const event = created.rows[0];
    return res.status(201).json({
      id: event.id,
      type: event.type,
      userId: event.user_id,
      displayName: userOut.rows[0]?.display_name || 'user',
      data: event.data || {},
      reactions: { agree: 0, disagree: 0, userReaction: null },
      createdAt: event.created_at
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:groupId/feed/:eventId/react', async (req, res, next) => {
  try {
    const role = await memberRole(req.params.groupId, req.user.id);
    if (!role) throw notFound('Grupo no encontrado', 'GROUP_NOT_FOUND');

    const event = await query('SELECT id FROM group_events WHERE id = $1 AND group_id = $2', [req.params.eventId, req.params.groupId]);
    if (!event.rows.length) throw notFound('Evento no encontrado', 'GROUP_EVENT_NOT_FOUND');

    const reaction = req.body?.reaction;
    if (reaction === null) {
      await query('DELETE FROM event_reactions WHERE event_id = $1 AND user_id = $2', [req.params.eventId, req.user.id]);
    } else {
      if (!['agree', 'disagree'].includes(reaction)) {
        throw badRequest('Reacción inválida', 'VALIDATION_ERROR');
      }

      await query(
        `INSERT INTO event_reactions (event_id, user_id, reaction)
         VALUES ($1, $2, $3)
         ON CONFLICT (event_id, user_id)
         DO UPDATE SET reaction = EXCLUDED.reaction, created_at = NOW()`,
        [req.params.eventId, req.user.id, reaction]
      );
    }

    const totals = await query(
      `SELECT reaction, COUNT(*)::int AS total
       FROM event_reactions
       WHERE event_id = $1
       GROUP BY reaction`,
      [req.params.eventId]
    );

    const out = { agree: 0, disagree: 0 };
    for (const r of totals.rows) out[r.reaction] = Number(r.total || 0);

    return res.json({ reactions: out });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
