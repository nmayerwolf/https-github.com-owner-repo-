const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

router.post('/', async (req, res, next) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { positions = [], config = null, watchlist = [] } = req.body || {};

    const existing = await client.query(
      `SELECT
        (SELECT COUNT(*) FROM positions WHERE user_id = $1 AND deleted_at IS NULL) AS positions_count,
        (SELECT COUNT(*) FROM watchlist_items WHERE user_id = $1) AS watchlist_count,
        (SELECT COUNT(*) FROM user_configs WHERE user_id = $1) AS config_count`,
      [req.user.id]
    );

    if (
      Number(existing.rows[0].positions_count) > 0 ||
      Number(existing.rows[0].watchlist_count) > 0 ||
      Number(existing.rows[0].config_count) > 0
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'ALREADY_MIGRATED', message: 'El usuario ya tiene datos en backend' });
    }

    let migratedPositions = 0;
    for (const p of positions) {
      if (!p.symbol || !p.buyDate || !p.buyPrice || !p.quantity) continue;
      await client.query(
        `INSERT INTO positions (user_id, symbol, name, category, buy_date, buy_price, quantity, sell_date, sell_price, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.user.id, p.symbol, p.name || p.symbol, p.category || 'equity', p.buyDate, p.buyPrice, p.quantity, p.sellDate || null, p.sellPrice || null, p.notes || null]
      );
      migratedPositions += 1;
    }

    let migratedWatchlist = 0;
    for (const w of watchlist) {
      if (!w.symbol) continue;
      await client.query(
        `INSERT INTO watchlist_items (user_id, symbol, name, type, category)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, symbol) DO NOTHING`,
        [req.user.id, w.symbol, w.name || w.symbol, w.type || 'stock', w.category || 'equity']
      );
      migratedWatchlist += 1;
    }

    let migratedConfig = false;
    if (config && typeof config === 'object') {
      await client.query(
        `INSERT INTO user_configs
         (user_id, risk_profile, horizon, sectors, max_pe, min_div_yield, min_mkt_cap, rsi_os, rsi_ob, vol_thresh, min_confluence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (user_id)
         DO UPDATE SET
           risk_profile = EXCLUDED.risk_profile,
           horizon = EXCLUDED.horizon,
           sectors = EXCLUDED.sectors,
           max_pe = EXCLUDED.max_pe,
           min_div_yield = EXCLUDED.min_div_yield,
           min_mkt_cap = EXCLUDED.min_mkt_cap,
           rsi_os = EXCLUDED.rsi_os,
           rsi_ob = EXCLUDED.rsi_ob,
           vol_thresh = EXCLUDED.vol_thresh,
           min_confluence = EXCLUDED.min_confluence,
           updated_at = NOW()`,
        [
          req.user.id,
          config.riskProfile || 'moderado',
          config.horizon || 'mediano',
          config.sectors || ['tech', 'crypto', 'metals'],
          config.maxPE || 50,
          config.minDivYield || 0,
          config.minMktCap || 100,
          config.rsiOS || 30,
          config.rsiOB || 70,
          config.volThresh || 2,
          config.minConfluence || 2
        ]
      );
      migratedConfig = true;
    }

    await client.query('COMMIT');
    return res.json({ migratedPositions, migratedConfig, migratedWatchlist });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
