const express = require('express');
const { query } = require('../config/db');
const { forbidden, notFound } = require('../utils/errors');
const { generateUniqueGroupCode } = require('../services/groupCode');

const router = express.Router();

const memberRole = async (groupId, userId) => {
  const found = await query('SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  return found.rows[0]?.role || null;
};

router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Nombre requerido' });

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
    const group = await query('SELECT id, name, code FROM groups WHERE code = $1', [code]);
    if (!group.rows.length) return res.status(404).json({ error: 'GROUP_NOT_FOUND', message: 'Código de invitación inválido' });

    const exists = await query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [group.rows[0].id, req.user.id]);
    if (exists.rows.length) return res.status(409).json({ error: 'ALREADY_MEMBER', message: 'Ya sos miembro de este grupo' });

    await query('INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,\'member\')', [group.rows[0].id, req.user.id]);
    const count = await query('SELECT COUNT(*)::int AS total FROM group_members WHERE group_id = $1', [group.rows[0].id]);

    return res.json({ ...group.rows[0], role: 'member', members: count.rows[0].total });
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

    const payloadMembers = [];
    for (const m of members.rows) {
      const positions = await query(
        `SELECT symbol, category, quantity
         FROM positions
         WHERE user_id = $1 AND deleted_at IS NULL AND sell_date IS NULL`,
        [m.user_id]
      );
      payloadMembers.push({
        userId: m.user_id,
        displayName: m.display_name,
        role: m.role,
        positions: positions.rows.map((p) => ({ symbol: p.symbol, category: p.category, quantity: Number(p.quantity), plPercent: null }))
      });
    }

    return res.json({ ...group.rows[0], role, members: payloadMembers });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const role = await memberRole(req.params.id, req.user.id);
    if (role !== 'admin') throw forbidden('Solo admin puede eliminar miembros', 'ADMIN_ONLY');

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

module.exports = router;
