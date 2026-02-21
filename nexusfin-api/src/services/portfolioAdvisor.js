const { env } = require('../config/env');
const { computeRegime } = require('./regime');
const { deriveFocusFromConfig, computeProfileMix, applyStrategyMixToRecommendations } = require('./profileFocus');
const { logAiUsage } = require('./aiUsageLogger');
const { calculateIndicators } = require('../engine/analysis');

// ── UPGRADED SYSTEM PROMPT ─────────────────────────────────────────────────────
const PORTFOLIO_SYSTEM_PROMPT = [
  'Sos el asesor de portfolio senior de Horsai, una plataforma de inversión inteligente.',
  'Tu rol es analizar el portfolio del usuario con rigor institucional y dar recomendaciones accionables y específicas.',
  '',
  'FRAMEWORK DE ANÁLISIS (seguir en orden):',
  '1. HEALTH CHECK: Evaluar concentración (por clase, sector, moneda), correlación implícita entre holdings, y exposición a factores de riesgo.',
  '2. RISK ASSESSMENT: Conectar cada holding con el régimen macro actual. Un portfolio 60% tech en régimen risk_off tiene un riesgo muy diferente al mismo portfolio en risk_on.',
  '3. PERFORMANCE ATTRIBUTION: Para cada holding, explicar si el PnL viene del beta de mercado, alpha sectorial, o timing.',
  '4. ACTIONABLE RECOMMENDATIONS: Cada recomendación debe tener: QUÉ hacer, POR QUÉ (con datos), CUÁNTO (% del portfolio), y CUÁNDO salir (condición de invalidación).',
  '',
  'PRINCIPIOS:',
  '- NUNCA decir "diversificar más" sin especificar: diversificar HACIA QUÉ, CUÁNTO, y POR QUÉ ESO específicamente.',
  '- Cada observación sobre un holding DEBE referenciar su RSI, posición vs SMA50, vol20d, y peso en cartera.',
  '- Si un holding tiene PnL > +20%, analizar si conviene tomar ganancia parcial (tax-loss harvesting, rebalance) o mantener basado en momentum.',
  '- Si un holding tiene PnL < -15%, evaluar si la tesis original sigue vigente o si es mejor realizar la pérdida.',
  '- health_summary debe ser una oración que capture el PRINCIPAL problema o fortaleza del portfolio, no un resumen genérico.',
  '- Recommendations deben estar ordenadas por urgencia (high → medium → low).',
  '',
  'ANTI-PATTERNS (evitar):',
  '- "Portfolio concentrado en tech. Diversificar." → especificar con qué, cuánto, y mostrar impacto esperado en riesgo',
  '- "Mantener posiciones actuales." → siempre hay algo accionable, aunque sea rebalancear 2%',
  '- health_summary genérico: "Portfolio con foco en equities" → "Portfolio 72% equity / 28% crypto con correlación implícita alta (ambos risk-on); vulnerable a corrección >5% si VIX supera 22"',
  '- Recomendaciones sin sizing: "Agregar bonds" → "Rotar 8-10% de NVDA (sobrecompra RSI 74, peso 22%) hacia TLT para reducir beta de portfolio de 1.2 a ~0.95"',
  '',
  'IDIOMA: Español. FORMATO: JSON estricto, sin markdown ni backticks.',
].join('\n');

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

    const markPrice = toNum(row?.current_price, buyPrice);
    const value = quantity * (Number.isFinite(markPrice) && markPrice > 0 ? markPrice : buyPrice);
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

const toNum = (value, fallback = null) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
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

const buildPrompt = ({ positions, summary, config, macro, agentHistory, marketContext = {} }) => [
  'Sos un asesor de portfolio del equipo de Horsai.',
  'Generá observaciones accionables con números concretos y conexión al régimen actual.',
  '',
  'PORTFOLIO DETAIL:',
  `- Total value: ${Number(summary.totalValue || 0).toFixed(2)}`,
  `- Number of holdings: ${Array.isArray(positions) ? positions.length : 0}`,
  `- Holdings: ${
    (Array.isArray(positions) ? positions : [])
      .map((p) => {
        const parts = [
          `${p.symbol || 'N/A'}`,
          `qty=${toNum(p.quantity, 0)}`,
          `avg=${toNum(p.buy_price, 0)}`,
          `price=${toNum(p.current_price, null) == null ? 'N/D' : Number(p.current_price).toFixed(2)}`,
          `pnl_pct=${toNum(p.pnl_pct, null) == null ? 'N/D' : Number(p.pnl_pct).toFixed(2)}%`,
          `weight=${toNum(p.weight_pct, null) == null ? 'N/D' : Number(p.weight_pct).toFixed(2)}%`,
          `rsi=${toNum(p.rsi, null) == null ? 'N/D' : Number(p.rsi).toFixed(1)}`,
          `above_sma50=${p.above_sma50 == null ? 'N/D' : Boolean(p.above_sma50)}`,
          `vol20d=${toNum(p.volatility_20d, null) == null ? 'N/D' : `${(Number(p.volatility_20d) * 100).toFixed(1)}%`}`
        ];
        return parts.join(' | ');
      })
      .join(' || ')
  }`,
  `- Distribucion por clase: ${JSON.stringify(summary.allocationByClass)}`,
  `- Distribucion por moneda: ${JSON.stringify(summary.allocationByCurrency)}`,
  `- Distribucion por sector: ${JSON.stringify(summary.allocationBySector)}`,
  '',
  'PERFIL DEL USUARIO:',
  `- Riesgo: ${config?.risk_profile || 'moderado'}`,
  `- Horizonte: ${config?.horizon || 'mediano'}`,
  `- Focus slider (0-1): ${deriveFocusFromConfig(config)}`,
  '',
  'CONTEXTO MACRO HOY:',
  `- Sentimiento: ${macro?.market_sentiment || 'neutral'}`,
  `- Temas principales: ${pickTop(Object.fromEntries((safeArray(macro?.themes).slice(0, 3).map((x) => [x.theme || 'tema', x.conviction || 0]))), 3) || 'N/A'}`,
  `- Regime: ${marketContext?.regime || 'transition'} (${marketContext?.volatilityRegime || 'normal'})`,
  `- Leadership: ${Array.isArray(marketContext?.leadership) && marketContext.leadership.length ? marketContext.leadership.join(', ') : 'N/A'}`,
  `- Alignment score: ${toNum(marketContext?.alignmentScore, null) == null ? 'N/D' : Number(marketContext.alignmentScore).toFixed(2)}`,
  '',
  'HISTORIAL DEL AGENTE:',
  `- Señales similares anteriores: ${Number(agentHistory?.count || 0)}`,
  `- Win rate en señales similares: ${Number(agentHistory?.hitRatePct || 0).toFixed(2)}%`,
  `- Última señal del agente: ${agentHistory?.lastSignalSummary || 'sin historial'}`,
  '',
  'REGLAS DE CALIDAD:',
  '- Referenciar tickers concretos y números reales del portfolio (peso%, PnL%, RSI, vol20d).',
  '- Conectar cada observación con el régimen actual y explicar POR QUÉ importa en este contexto.',
  '- Evitar frases genéricas como "diversificar más" o "mantener posiciones".',
  '- Cada recommendation debe incluir: tipo de acción + activo específico + sizing (% del portfolio) + trigger concreto.',
  '- health_summary: UNA oración que capture el hallazgo MÁS importante (no un resumen genérico del portfolio).',
  '- allocation_analysis.reasoning: explicar la LÓGICA del cambio sugerido, no solo describir el cambio.',
  '- Si hay holdings con PnL > +25% o < -15%, SIEMPRE incluir recomendación específica para ellos.',
  '- Si hay concentración > 30% en un solo activo, es SIEMPRE prioridad alta.',
  '',
  'EJEMPLO DE CALIDAD:',
  '',
  'BAD health_summary: "Portfolio concentrado en tech. Diversificar."',
  'GOOD health_summary: "NVDA pesa 28% del portfolio con RSI 74 en régimen risk_on — sostenible a corto plazo pero un retroceso del 8% impactaría -2.2% al portfolio total. Rotar 8% hacia GLD/TLT reduciría drawdown esperado de 12% a 8%."',
  '',
  'BAD recommendation: {"type":"add","asset":"GLD","detail":"Agregar oro como cobertura.","amount_pct":5}',
  'GOOD recommendation: {"type":"reduce","priority":"high","asset":"NVDA","detail":"NVDA RSI 74, peso 28%, PnL +45%. Tomar ganancia del 30% de la posición (≈8% del portfolio) y rotar hacia TLT (duration larga, beneficia si Fed pivotea) o GLD (hedge de cola). Trigger: ejecutar si RSI > 70 y se mantiene por 3 sesiones. Invalidar si NVDA rompe ATH con volumen.","amount_pct":-8}',
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
  const loadMarketContext = async (symbols = []) => {
    const cleanSymbols = Array.from(new Set((Array.isArray(symbols) ? symbols : []).map((s) => String(s || '').toUpperCase()).filter(Boolean)));
    const [dateOut, regimeOut] = await Promise.all([
      query('SELECT MAX(date)::text AS date FROM market_daily_bars'),
      query('SELECT regime, volatility_regime, leadership FROM regime_state ORDER BY date DESC LIMIT 1')
    ]);
    const marketDate = String(dateOut.rows?.[0]?.date || '').slice(0, 10);
    const regime = regimeOut.rows?.[0] || {};
    if (!marketDate || !cleanSymbols.length) {
      return {
        marketDate: marketDate || null,
        regime: String(regime?.regime || 'transition'),
        volatilityRegime: String(regime?.volatility_regime || 'normal'),
        leadership: Array.isArray(regime?.leadership) ? regime.leadership : [],
        bySymbol: new Map()
      };
    }

    const [closesOut, barsOut, volOut] = await Promise.all([
      query(
        `SELECT symbol, close
         FROM market_daily_bars
         WHERE date = $1
           AND symbol = ANY($2::text[])`,
        [marketDate, cleanSymbols]
      ),
      query(
        `SELECT symbol, date::text AS date, high, low, close, volume
         FROM market_daily_bars
         WHERE symbol = ANY($1::text[])
           AND date <= $2
         ORDER BY symbol ASC, date ASC`,
        [cleanSymbols, marketDate]
      ),
      query(
        `SELECT symbol, vol_20d
         FROM market_metrics_daily
         WHERE date = $1
           AND symbol = ANY($2::text[])`,
        [marketDate, cleanSymbols]
      )
    ]);

    const closeMap = new Map((closesOut.rows || []).map((row) => [String(row.symbol || '').toUpperCase(), toNum(row.close, null)]));
    const volMap = new Map((volOut.rows || []).map((row) => [String(row.symbol || '').toUpperCase(), toNum(row.vol_20d, null)]));
    const grouped = new Map();
    for (const row of barsOut.rows || []) {
      const symbol = String(row.symbol || '').toUpperCase();
      if (!symbol) continue;
      if (!grouped.has(symbol)) grouped.set(symbol, { closes: [], highs: [], lows: [], volumes: [] });
      const bucket = grouped.get(symbol);
      bucket.closes.push(Number(row.close));
      bucket.highs.push(Number(row.high));
      bucket.lows.push(Number(row.low));
      bucket.volumes.push(Number(row.volume || 0));
    }
    const bySymbol = new Map();
    for (const symbol of cleanSymbols) {
      const indicators = calculateIndicators(grouped.get(symbol) || {}) || {};
      bySymbol.set(symbol, {
        close: closeMap.get(symbol),
        rsi: toNum(indicators.rsi, null),
        sma50: toNum(indicators.sma50, null),
        volatility20d: volMap.get(symbol)
      });
    }

    return {
      marketDate,
      regime: String(regime?.regime || 'transition'),
      volatilityRegime: String(regime?.volatility_regime || 'normal'),
      leadership: Array.isArray(regime?.leadership) ? regime.leadership : [],
      bySymbol
    };
  };

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

    const marketContext = await loadMarketContext(positions.map((p) => p.symbol));
    const totalValue = positions.reduce((acc, row) => {
      const symbol = String(row.symbol || '').toUpperCase();
      const qty = toNum(row.quantity, 0);
      const mark = toNum(marketContext.bySymbol.get(symbol)?.close, toNum(row.buy_price, 0));
      return acc + qty * mark;
    }, 0);
    const enrichedPositions = positions.map((row) => {
      const symbol = String(row.symbol || '').toUpperCase();
      const qty = toNum(row.quantity, 0);
      const buy = toNum(row.buy_price, 0);
      const mark = toNum(marketContext.bySymbol.get(symbol)?.close, buy);
      const value = qty * mark;
      const pnlPct = buy > 0 ? ((mark - buy) / buy) * 100 : null;
      const sma50 = toNum(marketContext.bySymbol.get(symbol)?.sma50, null);
      return {
        ...row,
        symbol,
        current_price: mark,
        pnl_pct: pnlPct,
        weight_pct: totalValue > 0 ? (value / totalValue) * 100 : null,
        rsi: toNum(marketContext.bySymbol.get(symbol)?.rsi, null),
        above_sma50: Number.isFinite(mark) && Number.isFinite(sma50) ? mark >= sma50 : null,
        volatility_20d: toNum(marketContext.bySymbol.get(symbol)?.volatility20d, null)
      };
    });

    const summary = summarizePortfolio(enrichedPositions);
    const fallback = fallbackAdvice({ summary, macro, riskProfile: config?.risk_profile || 'moderado' });

    let advice = fallback;
    let model = null;
    let usage = null;
    const startedAt = Date.now();

    if (aiAgent?.configured && env.aiAgentEnabled && env.anthropicApiKey) {
      try {
        const response = await aiAgent.callAnthropic({
          apiKey: env.anthropicApiKey,
          model: env.aiAgentModel,
          timeoutMs: env.aiAgentTimeoutMs,
          systemPrompt: PORTFOLIO_SYSTEM_PROMPT,
          userPrompt: buildPrompt({
            positions: enrichedPositions,
            summary,
            config,
            macro,
            agentHistory,
            marketContext: {
              regime: marketContext.regime,
              volatilityRegime: marketContext.volatilityRegime,
              leadership: marketContext.leadership
            }
          })
        });
        usage = response?.raw?.usage || null;
        const parsed = extractJsonBlock(response.text);
        if (parsed) {
          advice = normalizeAdvice(parsed, fallback);
          model = env.aiAgentModel;
        }
      } catch (error) {
        logger.warn?.('[portfolioAdvisor] ai generation fallback', error?.message || error);
      }
    }

    const regime = computeRegime({
      marketSentiment: macro?.market_sentiment || 'neutral',
      spyVol20dZ: macro?.spy_vol_20d_z ?? null,
      spyRet1d: macro?.spy_ret_1d ?? null,
      shockEventFlag: Boolean(macro?.shock_event_flag)
    });
    const profileMix = computeProfileMix(deriveFocusFromConfig(config));
    const recommendationBase = Array.isArray(advice.recommendations) ? advice.recommendations : [];
    advice = {
      ...advice,
      regime,
      profileMix,
      recommendations: applyStrategyMixToRecommendations(recommendationBase, profileMix.focus)
    };

    const row = await persistAdvice({ userId, advice, model });
    await logAiUsage({
      query,
      userId,
      feature: 'portfolio_advice',
      model: model || env.aiAgentModel,
      usage,
      success: Boolean(model),
      durationMs: Date.now() - startedAt
    });
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
