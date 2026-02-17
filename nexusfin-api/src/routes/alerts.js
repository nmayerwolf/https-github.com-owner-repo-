const express = require('express');
const { query } = require('../config/db');
const { badRequest, conflict, forbidden, notFound } = require('../utils/errors');
const { createPushNotifier } = require('../services/push');
const { ALERT_TYPES, normalizeAlertSummary } = require('../../../packages/nexusfin-core/contracts.cjs');

const router = express.Router();
const pushNotifier = createPushNotifier({ query, logger: console });

const allowedTypes = new Set(ALERT_TYPES);

router.get('/macro', async (req, res, next) => {
  try {
    const macroRadar = req.app?.locals?.macroRadar;
    if (!macroRadar?.getLatestForUser) {
      return res.status(503).json({ error: 'MACRO_RADAR_UNAVAILABLE', message: 'Macro Radar no disponible.' });
    }
    const latest = await macroRadar.getLatestForUser(req.user.id);
    if (!latest) {
      return res.json({ insight: null });
    }
    return res.json({
      insight: {
        id: latest.id,
        marketSentiment: latest.market_sentiment,
        sentimentReasoning: latest.sentiment_reasoning,
        themes: Array.isArray(latest.themes) ? latest.themes : [],
        keyEvents: Array.isArray(latest.key_events) ? latest.key_events : [],
        aiModel: latest.ai_model,
        createdAt: latest.created_at
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/macro/refresh', async (req, res, next) => {
  try {
    const macroRadar = req.app?.locals?.macroRadar;
    if (!macroRadar?.generateForUser) {
      return res.status(503).json({ error: 'MACRO_RADAR_UNAVAILABLE', message: 'Macro Radar no disponible.' });
    }
    const generated = await macroRadar.generateForUser(req.user.id);
    return res.status(201).json({
      insight: {
        id: generated.id,
        marketSentiment: generated.market_sentiment,
        sentimentReasoning: generated.sentiment_reasoning,
        themes: Array.isArray(generated.themes) ? generated.themes : [],
        keyEvents: Array.isArray(generated.key_events) ? generated.key_events : [],
        aiModel: generated.ai_model,
        createdAt: generated.created_at,
        source: generated.source || 'ai'
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/portfolio-advice', async (req, res, next) => {
  try {
    const portfolioAdvisor = req.app?.locals?.portfolioAdvisor;
    if (!portfolioAdvisor?.getLatestForUser) {
      return res.status(503).json({ error: 'PORTFOLIO_ADVISOR_UNAVAILABLE', message: 'Portfolio Advisor no disponible.' });
    }

    const latest = await portfolioAdvisor.getLatestForUser(req.user.id);
    if (!latest) return res.json({ advice: null });

    return res.json({
      advice: {
        id: latest.id,
        healthScore: Number(latest.health_score || 0),
        healthSummary: latest.health_summary || '',
        concentrationRisk: latest.concentration_risk || 'medium',
        allocationAnalysis: latest.allocation_analysis || {},
        recommendations: Array.isArray(latest.recommendations) ? latest.recommendations : [],
        aiModel: latest.ai_model,
        createdAt: latest.created_at
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/portfolio-advice/refresh', async (req, res, next) => {
  try {
    const portfolioAdvisor = req.app?.locals?.portfolioAdvisor;
    if (!portfolioAdvisor?.generateForUser) {
      return res.status(503).json({ error: 'PORTFOLIO_ADVISOR_UNAVAILABLE', message: 'Portfolio Advisor no disponible.' });
    }

    const generated = await portfolioAdvisor.generateForUser(req.user.id);
    if (generated?.skipped) {
      return res.json({ advice: null, skipped: true, reason: generated.reason, minimumPositions: generated.minimumPositions, currentPositions: generated.currentPositions });
    }

    return res.status(201).json({
      advice: {
        id: generated.id,
        healthScore: Number(generated.health_score || 0),
        healthSummary: generated.health_summary || '',
        concentrationRisk: generated.concentration_risk || 'medium',
        allocationAnalysis: generated.allocation_analysis || {},
        recommendations: Array.isArray(generated.recommendations) ? generated.recommendations : [],
        aiModel: generated.ai_model,
        createdAt: generated.created_at,
        source: generated.source || 'ai'
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const type = req.query.type ? String(req.query.type).trim() : null;

    if (type && !allowedTypes.has(type)) {
      throw badRequest('Tipo de alerta inválido', 'VALIDATION_ERROR');
    }

    const where = ['user_id = $1'];
    const params = [req.user.id];

    if (type) {
      params.push(type);
      where.push(`type = $${params.length}`);
    }

    const whereSql = where.join(' AND ');

    const listQuery = `
      SELECT id, symbol, name, type, recommendation, confidence, confluence_bull, confluence_bear,
             signals, price_at_alert, stop_loss, take_profit, outcome, ai_thesis, notified, created_at
      FROM alerts
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const list = await query(listQuery, [...params, limit, offset]);

    const count = await query(`SELECT COUNT(*)::int AS total FROM alerts WHERE ${whereSql}`, params);

    const stats = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE type = 'opportunity')::int AS opportunities,
         COUNT(*) FILTER (WHERE type = 'bearish')::int AS bearish,
         COUNT(*) FILTER (WHERE type = 'stop_loss')::int AS stop_loss,
         COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins,
         COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses,
         COUNT(*) FILTER (WHERE outcome_24h = 'win')::int AS wins_24h,
         COUNT(*) FILTER (WHERE outcome_24h = 'loss')::int AS losses_24h,
         COUNT(*) FILTER (WHERE outcome_7d = 'win')::int AS wins_7d,
         COUNT(*) FILTER (WHERE outcome_7d = 'loss')::int AS losses_7d,
         COUNT(*) FILTER (WHERE outcome_30d = 'win')::int AS wins_30d,
         COUNT(*) FILTER (WHERE outcome_30d = 'loss')::int AS losses_30d,
         AVG(((outcome_price - price_at_alert) / NULLIF(price_at_alert,0)) * 100)
           FILTER (WHERE outcome = 'win' AND outcome_price IS NOT NULL)::float AS avg_return
       FROM alerts
       WHERE user_id = $1`,
      [req.user.id]
    );

    const byType = await query(
      `SELECT type,
              COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins,
              COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses
       FROM alerts
       WHERE user_id = $1
       GROUP BY type`,
      [req.user.id]
    );

    const byConfidence = await query(
      `SELECT COALESCE(NULLIF(ai_confidence, ''), confidence) AS bucket,
              COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins,
              COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses
       FROM alerts
       WHERE user_id = $1
       GROUP BY COALESCE(NULLIF(ai_confidence, ''), confidence)`,
      [req.user.id]
    );

    const byAssetClass = await query(
      `SELECT
         CASE
           WHEN symbol LIKE '%USDT' THEN 'crypto'
           WHEN symbol LIKE '%\\_%' ESCAPE '\\' THEN 'fx'
           ELSE 'equity'
         END AS asset_class,
         COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins,
         COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses
       FROM alerts
       WHERE user_id = $1
       GROUP BY 1`,
      [req.user.id]
    );

    const recentClosed = await query(
      `SELECT symbol, type, outcome, created_at
       FROM alerts
       WHERE user_id = $1
         AND outcome IN ('win','loss')
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user.id]
    );

    const bestWorstMonth = await query(
      `SELECT symbol, type, recommendation, created_at,
              CASE
                WHEN type = 'bearish' AND outcome_price IS NOT NULL
                  THEN ((price_at_alert - outcome_price) / NULLIF(price_at_alert,0)) * 100
                WHEN outcome_price IS NOT NULL
                  THEN ((outcome_price - price_at_alert) / NULLIF(price_at_alert,0)) * 100
                ELSE NULL
              END AS realized_return_pct
       FROM alerts
       WHERE user_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'
         AND outcome_price IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.user.id]
    );

    const s = stats.rows[0] || {};
    const wins = Number(s.wins || 0);
    const losses = Number(s.losses || 0);
    const windowHitRate = (winKey, lossKey) => {
      const w = Number(s[winKey] || 0);
      const l = Number(s[lossKey] || 0);
      return w + l > 0 ? w / (w + l) : 0;
    };
    const toRatioRows = (rows, labelKey) =>
      rows.map((row) => {
        const w = Number(row.wins || 0);
        const l = Number(row.losses || 0);
        return {
          [labelKey]: row[labelKey],
          wins: w,
          losses: l,
          hitRate: w + l > 0 ? w / (w + l) : 0
        };
      });
    const trendLast30 = recentClosed.rows
      .slice()
      .reverse()
      .map((row) => (String(row.outcome || '').toLowerCase() === 'win' ? 1 : 0));
    const monthlyReturns = bestWorstMonth.rows
      .map((row) => ({
        symbol: row.symbol,
        type: row.type,
        recommendation: row.recommendation,
        createdAt: row.created_at,
        realizedReturnPct: Number(row.realized_return_pct)
      }))
      .filter((row) => Number.isFinite(row.realizedReturnPct));
    const bestSignalMonth = monthlyReturns.length
      ? monthlyReturns.reduce((best, cur) => (cur.realizedReturnPct > best.realizedReturnPct ? cur : best), monthlyReturns[0])
      : null;
    const worstSignalMonth = monthlyReturns.length
      ? monthlyReturns.reduce((worst, cur) => (cur.realizedReturnPct < worst.realizedReturnPct ? cur : worst), monthlyReturns[0])
      : null;

    return res.json({
      alerts: list.rows.map(normalizeAlertSummary),
      pagination: {
        page,
        limit,
        total: Number(count.rows[0]?.total || 0),
        pages: Math.max(1, Math.ceil(Number(count.rows[0]?.total || 0) / limit))
      },
      stats: {
        total: Number(s.total || 0),
        opportunities: Number(s.opportunities || 0),
        bearish: Number(s.bearish || 0),
        stopLoss: Number(s.stop_loss || 0),
        hitRate: wins + losses > 0 ? wins / (wins + losses) : 0,
        avgReturn: Number.isFinite(s.avg_return) ? Number(s.avg_return) : 0,
        hitRate24h: windowHitRate('wins_24h', 'losses_24h'),
        hitRate7d: windowHitRate('wins_7d', 'losses_7d'),
        hitRate30d: windowHitRate('wins_30d', 'losses_30d'),
        byType: toRatioRows(byType.rows || [], 'type'),
        byAssetClass: toRatioRows(byAssetClass.rows || [], 'asset_class'),
        byConfidence: toRatioRows(byConfidence.rows || [], 'bucket'),
        trendLast30,
        bestSignalMonth,
        worstSignalMonth
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const out = await query(
      `SELECT id, symbol, name, type, recommendation, confidence, confluence_bull, confluence_bear,
              signals, price_at_alert, stop_loss, take_profit, outcome, outcome_price, outcome_date,
              ai_thesis, snapshot, notified, created_at
       FROM alerts
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (!out.rows.length) throw notFound('Alerta no encontrada', 'ALERT_NOT_FOUND');

    const row = out.rows[0];
    return res.json({
      ...normalizeAlertSummary(row),
      outcomePrice: row.outcome_price == null ? null : Number(row.outcome_price),
      outcomeDate: row.outcome_date,
      snapshot: row.snapshot || null
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/share', async (req, res, next) => {
  try {
    const groupId = String(req.body?.groupId || '').trim();
    if (!groupId) throw badRequest('groupId requerido', 'VALIDATION_ERROR');

    const alert = await query('SELECT id, symbol, recommendation, price_at_alert FROM alerts WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id
    ]);
    if (!alert.rows.length) throw notFound('Alerta no encontrada', 'ALERT_NOT_FOUND');

    const member = await query('SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, req.user.id]);
    if (!member.rows.length) throw forbidden('No sos miembro de este grupo', 'GROUP_ACCESS_DENIED');

    const inserted = await query(
      `INSERT INTO shared_alerts (alert_id, group_id, shared_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (alert_id, group_id) DO NOTHING
       RETURNING shared_at`,
      [req.params.id, groupId, req.user.id]
    );

    if (!inserted.rows.length) throw conflict('La alerta ya fue compartida en este grupo', 'ALREADY_SHARED');

    await query(
      `INSERT INTO group_events (group_id, user_id, type, data)
       VALUES ($1, $2, 'signal_shared', $3::jsonb)`,
      [
        groupId,
        req.user.id,
        JSON.stringify({
          alertId: req.params.id,
          symbol: alert.rows[0].symbol,
          recommendation: alert.rows[0].recommendation,
          priceAtShare: Number(alert.rows[0].price_at_alert)
        })
      ]
    );

    try {
      await pushNotifier.notifyGroupActivity({
        groupId,
        actorUserId: req.user.id,
        event: {
          type: 'signal_shared',
          title: `Nueva señal en grupo: ${alert.rows[0].symbol}`,
          body: `${alert.rows[0].recommendation} compartida por un miembro`,
          data: {
            alertId: req.params.id,
            symbol: alert.rows[0].symbol
          }
        }
      });
    } catch {
      // keep share action successful even if push fails
    }

    return res.json({ shared: true, sharedAt: inserted.rows[0].shared_at });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
