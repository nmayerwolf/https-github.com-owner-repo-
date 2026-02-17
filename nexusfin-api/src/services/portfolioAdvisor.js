const { env } = require('../config/env');

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const safeArray = (value) => (Array.isArray(value) ? value : []);

const extractJsonBlock = (input) => {
  const raw = String(input || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const inferCurrency = (symbol = '') => {
  const upper = String(symbol || '').toUpperCase();
  if (upper.includes('_')) {
    const parts = upper.split('_');
    if (parts[1]) return parts[1];
  }
  if (upper.endsWith('EUR')) return 'EUR';
  if (upper.endsWith('GBP')) return 'GBP';
  if (upper.endsWith('JPY')) return 'JPY';
  return 'USD';
};

const inferSector = (category = '') => {
  const normalized = String(category || '').toLowerCase();
  if (normalized === 'crypto') return 'crypto';
  if (normalized === 'bond') return 'fixed_income';
  if (normalized === 'metal') return 'metals';
  if (normalized === 'commodity') return 'commodities';
  if (normalized === 'fx') return 'fx';
  return 'equity';
};

const toPctMap = (totals = {}, totalValue = 0) => {
  const out = {};
  for (const [key, value] of Object.entries(totals)) {
    const num = Number(value || 0);
    out[key] = totalValue > 0 ? Number(((num / totalValue) * 100).toFixed(2)) : 0;
  }
  return out;
};

const summarizePortfolio = (positions = []) => {
  const totalsByClass = {};
  const totalsByCurrency = {};
  const totalsBySector = {};
  let totalValue = 0;

  for (const row of positions) {
    const quantity = Number(row?.quantity || 0);
    const buyPrice = Number(row?.buy_price || 0);
    if (!Number.isFinite(quantity) || !Number.isFinite(buyPrice) || quantity <= 0 || buyPrice <= 0) continue;

    const value = quantity * buyPrice;
    totalValue += value;

    const assetClass = String(row?.category || 'equity').toLowerCase();
    const currency = inferCurrency(row?.symbol);
    const sector = inferSector(row?.category);

    totalsByClass[assetClass] = Number(totalsByClass[assetClass] || 0) + value;
    totalsByCurrency[currency] = Number(totalsByCurrency[currency] || 0) + value;
    totalsBySector[sector] = Number(totalsBySector[sector] || 0) + value;
  }

  return {
    totalValue,
    positionsCount: positions.length,
    allocationByClass: toPctMap(totalsByClass, totalValue),
    allocationByCurrency: toPctMap(totalsByCurrency, totalValue),
    allocationBySector: toPctMap(totalsBySector, totalValue)
  };
};

const buildAgentHistory = ({ stats = {}, latest = null }) => {
  const wins = Number(stats.wins || 0);
  const losses = Number(stats.losses || 0);
  const count = Number(stats.count || 0);
  const hitRatePct = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const lastSignalSummary = latest
    ? `${latest.symbol || 'N/A'} ${latest.recommendation || ''} hace ${latest.daysAgo || 0}d (${latest.outcome || 'open'})`
    : 'sin historial';
  return { count, hitRatePct, lastSignalSummary };
};

const pickTop = (obj = {}, limit = 3) =>
  Object.entries(obj)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([k, v]) => `${k}:${Number(v).toFixed(2)}%`)
    .join(', ');

const fallbackAdvice = ({ summary, macro, riskProfile }) => {
  const byClass = summary.allocationByClass || {};
  const entries = Object.entries(byClass).sort((a, b) => Number(b[1]) - Number(a[1]));
  const topClass = entries[0] || ['equity', 0];
  const concentrationRisk = Number(topClass[1]) >= 55 ? 'high' : Number(topClass[1]) >= 35 ? 'medium' : 'low';

  const suggested = { ...byClass };
  if (riskProfile === 'conservador') {
    suggested.bond = Math.max(10, Number(suggested.bond || 0));
    suggested.crypto = Math.max(0, Number(suggested.crypto || 0) - 5);
  }
  if (riskProfile === 'agresivo') {
    suggested.equity = Number(suggested.equity || 0) + 5;
  }

  const recommendations = [];
  if (concentrationRisk !== 'low') {
    recommendations.push({
      type: 'reduce',
      priority: 'high',
      asset: topClass[0],
      detail: `Reducir concentración en ${topClass[0]} (${Number(topClass[1]).toFixed(1)}%).`,
      amount_pct: -10
    });
  }

  if (macro?.market_sentiment === 'bearish') {
    recommendations.push({
      type: 'add',
      priority: 'medium',
      asset: 'GLD',
      detail: 'Agregar cobertura defensiva ante contexto macro más adverso.',
      amount_pct: 8
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      type: 'hold',
      priority: 'low',
      asset: 'portfolio',
      detail: 'Mantener asignación actual y revisar en 1 semana.',
      amount_pct: 0
    });
  }

  return {
    health_score: clamp(Math.round(8 - Number(topClass[1]) / 20), 1, 10),
    health_summary: `Portfolio con foco principal en ${topClass[0]}.`,
    concentration_risk: concentrationRisk,
    allocation_analysis: {
      by_class: {
        current: byClass,
        suggested,
        reasoning: 'Ajuste automático de fallback por perfil y concentración.'
      },
      by_currency: {
        current: summary.allocationByCurrency,
        suggested: summary.allocationByCurrency,
        reasoning: 'Sin cambios en fallback automático.'
      }
    },
    recommendations,
    next_review: '1w'
  };
};

const buildPrompt = ({ positions, summary, config, macro, agentHistory }) => [
  'Sos un asesor de portfolio del equipo de Horsai.',
  '',
  `PORTFOLIO ACTUAL: ${JSON.stringify(positions)}`,
  `- Valor total: ${Number(summary.totalValue || 0).toFixed(2)}`,
  `- Distribucion por clase: ${JSON.stringify(summary.allocationByClass)}`,
  `- Distribucion por moneda: ${JSON.stringify(summary.allocationByCurrency)}`,
  `- Distribucion por sector: ${JSON.stringify(summary.allocationBySector)}`,
  '',
  'PERFIL DEL USUARIO:',
  `- Riesgo: ${config?.risk_profile || 'moderado'}`,
  `- Horizonte: ${config?.horizon || 'mediano'}`,
  '',
  'CONTEXTO MACRO HOY:',
  `- Sentimiento: ${macro?.market_sentiment || 'neutral'}`,
  `- Temas principales: ${pickTop(Object.fromEntries((safeArray(macro?.themes).slice(0, 3).map((x) => [x.theme || 'tema', x.conviction || 0]))), 3) || 'N/A'}`,
  '',
  'HISTORIAL DEL AGENTE:',
  `- Señales similares anteriores: ${Number(agentHistory?.count || 0)}`,
  `- Win rate en señales similares: ${Number(agentHistory?.hitRatePct || 0).toFixed(2)}%`,
  `- Última señal del agente: ${agentHistory?.lastSignalSummary || 'sin historial'}`,
  '',
  'Respondé en JSON estricto con schema:',
  '{"health_score":1,"health_summary":"string","concentration_risk":"low|medium|high","allocation_analysis":{"by_class":{"current":{},"suggested":{},"reasoning":"string"},"by_currency":{"current":{},"suggested":{},"reasoning":"string"}},"recommendations":[{"type":"reduce|increase|add|close|hold","priority":"high|medium|low","asset":"string","detail":"string","amount_pct":0}],"next_review":"1w|2w|1m"}'
].join('\n');

const normalizeAdvice = (raw = {}, fallback = {}) => {
  const merged = {
    ...fallback,
    ...raw,
    allocation_analysis: {
      ...(fallback.allocation_analysis || {}),
      ...(raw.allocation_analysis || {})
    },
    recommendations: safeArray(raw.recommendations).length ? safeArray(raw.recommendations) : safeArray(fallback.recommendations)
  };

  return {
    health_score: clamp(Math.round(Number(merged.health_score || fallback.health_score || 5)), 1, 10),
    health_summary: String(merged.health_summary || fallback.health_summary || ''),
    concentration_risk: ['low', 'medium', 'high'].includes(String(merged.concentration_risk || '').toLowerCase())
      ? String(merged.concentration_risk).toLowerCase()
      : 'medium',
    allocation_analysis: merged.allocation_analysis || {},
    recommendations: safeArray(merged.recommendations).slice(0, 8),
    next_review: ['1w', '2w', '1m'].includes(String(merged.next_review || '1w')) ? String(merged.next_review) : '1w'
  };
};

const createPortfolioAdvisor = ({ query, aiAgent = null, logger = console }) => {
  const getInputsForUser = async (userId) => {
    const [positionsOut, configOut, macroOut, statsOut, latestOut] = await Promise.all([
      query(
        'SELECT symbol, name, category, quantity, buy_price, buy_date FROM positions WHERE user_id = $1 AND sell_date IS NULL AND deleted_at IS NULL ORDER BY buy_date ASC',
        [userId]
      ),
      query('SELECT risk_profile, horizon, sectors FROM user_configs WHERE user_id = $1 LIMIT 1', [userId]),
      query('SELECT market_sentiment, themes, key_events FROM macro_insights WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]),
      query(
        `SELECT COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins,
                COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses
         FROM alerts
         WHERE user_id = $1`,
        [userId]
      ),
      query(
        `SELECT symbol, recommendation, outcome, created_at
         FROM alerts
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      )
    ]);
    const latest = latestOut.rows?.[0] || null;
    const latestInfo = latest
      ? {
          ...latest,
          daysAgo: Math.max(0, Math.round((Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60 * 24)))
        }
      : null;

    return {
      positions: positionsOut.rows || [],
      config: configOut.rows?.[0] || {},
      macro: macroOut.rows?.[0] || null,
      agentHistory: buildAgentHistory({ stats: statsOut.rows?.[0] || {}, latest: latestInfo })
    };
  };

  const persistAdvice = async ({ userId, advice, model }) => {
    const inserted = await query(
      `INSERT INTO portfolio_advice (user_id, health_score, health_summary, concentration_risk, allocation_analysis, recommendations, ai_model)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING id, user_id, health_score, health_summary, concentration_risk, allocation_analysis, recommendations, ai_model, created_at`,
      [
        userId,
        advice.health_score,
        advice.health_summary,
        advice.concentration_risk,
        JSON.stringify(advice.allocation_analysis || {}),
        JSON.stringify(advice.recommendations || []),
        model || null
      ]
    );
    return inserted.rows[0];
  };

  const generateForUser = async (userId) => {
    const { positions, config, macro, agentHistory } = await getInputsForUser(userId);
    if (positions.length < 2) {
      return { skipped: true, reason: 'MIN_PORTFOLIO_REQUIRED', minimumPositions: 2, currentPositions: positions.length };
    }

    const summary = summarizePortfolio(positions);
    const fallback = fallbackAdvice({ summary, macro, riskProfile: config?.risk_profile || 'moderado' });

    let advice = fallback;
    let model = null;

    if (aiAgent?.configured && env.aiAgentEnabled && env.anthropicApiKey) {
      try {
        const response = await aiAgent.callAnthropic({
          apiKey: env.anthropicApiKey,
          model: env.aiAgentModel,
          timeoutMs: env.aiAgentTimeoutMs,
          systemPrompt: 'Sos un asesor de portfolio institucional. Responde solo JSON.',
          userPrompt: buildPrompt({ positions, summary, config, macro, agentHistory })
        });
        const parsed = extractJsonBlock(response.text);
        if (parsed) {
          advice = normalizeAdvice(parsed, fallback);
          model = env.aiAgentModel;
        }
      } catch (error) {
        logger.warn?.('[portfolioAdvisor] ai generation fallback', error?.message || error);
      }
    }

    const row = await persistAdvice({ userId, advice, model });
    return {
      ...row,
      source: model ? 'ai' : 'fallback'
    };
  };

  const getLatestForUser = async (userId) => {
    const out = await query(
      `SELECT id, user_id, health_score, health_summary, concentration_risk, allocation_analysis, recommendations, ai_model, created_at
       FROM portfolio_advice
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    return out.rows?.[0] || null;
  };

  const runGlobalDaily = async () => {
    const users = await query('SELECT id FROM users ORDER BY created_at ASC');
    let generated = 0;
    for (const user of users.rows) {
      try {
        const out = await generateForUser(user.id);
        if (!out?.skipped) generated += 1;
      } catch (error) {
        logger.warn?.(`[portfolioAdvisor] failed for user ${user.id}`, error?.message || error);
      }
    }
    return { usersScanned: users.rows.length, generated };
  };

  return {
    generateForUser,
    getLatestForUser,
    runGlobalDaily
  };
};

module.exports = { createPortfolioAdvisor, summarizePortfolio, fallbackAdvice };
