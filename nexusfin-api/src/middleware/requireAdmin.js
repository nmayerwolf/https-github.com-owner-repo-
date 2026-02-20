const { query } = require('../config/db');

const requireAdmin = async (req, res, next) => {
  try {
    const userId = req?.user?.id;
    if (!userId) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const out = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (String(out.rows?.[0]?.role || 'user').toLowerCase() !== 'superadmin') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    return next();
  } catch {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
};

module.exports = { requireAdmin };
