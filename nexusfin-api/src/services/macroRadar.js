const { env } = require('../config/env');
const { logAiUsage } = require('./aiUsageLogger');

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

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

const coerceSentiment = (value) => {
  const out = String(value || '').toLowerCase();
  if (out === 'bullish' || out === 'bearish' || out === 'neutral') return out;
  return 'neutral';
};

const safeArray = (value) => (Array.isArray(value) ? value : []);

const safeThemes = (value) =>
  safeArray(value)
    .map((item) => ({
      theme: String(item?.theme || item?.name || 'Tema de mercado'),
      direction: String(item?.direction || 'neutral').toLowerCase() === 'bearish' ? 'bearish' : 'bullish',
      conviction: Math.max(1, Math.min(10, Number(item?.conviction || 5))),
      timeframe: String(item?.timeframe || '1m'),
      reasoning: String(item?.reasoning || item?.why || ''),
      catalysts: safeArray(item?.catalysts).slice(0, 5),
      risks: safeArray(item?.risks).slice(0, 5),
      suggested_assets: safeArray(item?.suggested_assets).slice(0, 6),
      relevance_to_user: String(item?.relevance_to_user || '')
    }))
    .slice(0, 5);

const safeEvents = (value) =>
  safeArray(value)
    .map((item) => ({
      event: String(item?.event || ''),
      date: String(item?.date || ''),
      potential_impact: String(item?.potential_impact || ''),
      assets_affected: safeArray(item?.assets_affected).slice(0, 8)
    }))
    .filter((item) => item.event)
    .slice(0, 10);

const buildFallbackInsight = ({ market, userContext }) => {
  const sentiment = Number(market?.indices?.sp500?.changePct || 0) > 0 ? 'bullish' : 'neutral';
  const themes = [
    {
      theme: 'Momentum de mercado global',
      direction: sentiment === 'bearish' ? 'bearish' : 'bullish',
      conviction: 6,
      timeframe: '1m',
      reasoning: 'Se prioriza un enfoque balanceado mientras se consolida la tendencia del mercado amplio.',
      catalysts: ['Resultados corporativos', 'Política monetaria'],
      risks: ['Volatilidad intradía', 'Eventos macro inesperados'],
      suggested_assets: [
        { symbol: 'SPY', name: 'SPDR S&P 500 ETF', why: 'Exposición diversificada al mercado de EE.UU.' },
        { symbol: 'QQQ', name: 'Invesco QQQ', why: 'Captura crecimiento tecnológico de gran capitalización' }
      ],
      relevance_to_user:
        userContext?.portfolioSummary?.positionsCount > 0
          ? 'Complementa un portfolio existente con beta amplia y liquidez.'
          : 'Punto de partida simple para exposición diversificada.'
    }
  ];

  return {
    market_sentiment: sentiment,
    sentiment_reasoning: 'Lectura preliminar generada sin modelo AI externo.',
    themes,
    key_events: []
  };
};

const summarizePortfolio = (rows = []) => {
  const summary = rows.reduce(
    (acc, row) => {
      const quantity = Number(row?.quantity || 0);
      const buyPrice = Number(row?.buy_price || 0);
      if (!Number.isFinite(quantity) || !Number.isFinite(buyPrice) || quantity <= 0 || buyPrice <= 0) return acc;
      acc.totalValue += quantity * buyPrice;
      acc.positionsCount += 1;
      return acc;
    },
    { totalValue: 0, positionsCount: 0 }
  );
  return summary;
};

const formatSignedPct = (value, digits = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'n/a';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(digits)}%`;
};

const formatPrice = (value, digits = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'n/a';
  return num.toFixed(digits);
};

const formatBreadth = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(1)}%` : 'n/a';
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

const pickBenchmark = (rows = [], symbol) => rows.find((row) => String(row?.symbol || '').toUpperCase() === String(symbol || '').toUpperCase()) || null;

const buildPrompt = ({ market, globalContext, headlines, userContext }) => {
  const benchmarkRows = Array.isArray(globalContext?.benchmarks) ? globalContext.benchmarks : [];
  const movers = Array.isArray(globalContext?.movers) ? globalContext.movers : [];
  const breadth = globalContext?.breadth?.pct_above_ma50;
  const regime = globalContext?.regime || null;
  const topHeadlines = headlines.slice(0, 30).map((item, idx) => `${idx + 1}. ${item?.headline || ''} [${item?.source || 'N/A'}]`).join('\n');
  const profile = userContext?.config || {};
  const portfolioSummary = userContext?.portfolioSummary || { totalValue: 0, positionsCount: 0 };
  const agentHistory = userContext?.agentHistory || { count: 0, hitRatePct: 0, lastSignalSummary: 'sin historial' };
  const marketDate = String(globalContext?.date || '').slice(0, 10) || 'n/a';

  const spy = pickBenchmark(benchmarkRows, 'SPY');
  const qqq = pickBenchmark(benchmarkRows, 'QQQ');
  const iwm = pickBenchmark(benchmarkRows, 'IWM');
  const dia = pickBenchmark(benchmarkRows, 'DIA');
  const btc = pickBenchmark(benchmarkRows, 'BTCUSDT');
  const eth = pickBenchmark(benchmarkRows, 'ETHUSDT');
  const gld = pickBenchmark(benchmarkRows, 'GLD');
  const uso = pickBenchmark(benchmarkRows, 'USO');
  const tlt = pickBenchmark(benchmarkRows, 'TLT');
  const eurusd = pickBenchmark(benchmarkRows, 'EUR_USD');
  const usdjpy = pickBenchmark(benchmarkRows, 'USD_JPY');
  const spyVol20d = Number(spy?.vol_20d);
  const spyMa50 = Number(spy?.ma50);
  const spyClose = Number(spy?.close);
  const spyRet1m = Number(spy?.ret_1m);
  const spyAboveMa50 = Number.isFinite(spyClose) && Number.isFinite(spyMa50) ? (spyClose >= spyMa50 ? 'Yes' : 'No') : 'n/a';
  const moversText = movers
    .map((m) => `${m.symbol} (${m.name || 'N/A'}): ${formatSignedPct(Number(m.change_pct), 2)}`)
    .join('\n');

  return [
    'Sos un estratega de inversion global del equipo de Horsai.',
    'Tu trabajo es producir insights accionables y personalizados con datos reales del día, evitando texto genérico.',
    '',
    `DATOS DE MERCADO (${marketDate}):`,
    `- SPY: ${formatPrice(spy?.close)} (${formatSignedPct(spy?.change_pct, 2)}) | QQQ: ${formatPrice(qqq?.close)} (${formatSignedPct(qqq?.change_pct, 2)}) | DIA: ${formatPrice(dia?.close)} (${formatSignedPct(dia?.change_pct, 2)}) | IWM: ${formatPrice(iwm?.close)} (${formatSignedPct(iwm?.change_pct, 2)})`,
    `- BTCUSDT: ${formatPrice(btc?.close)} (${formatSignedPct(btc?.change_pct, 2)}) | ETHUSDT: ${formatPrice(eth?.close)} (${formatSignedPct(eth?.change_pct, 2)})`,
    `- GLD: ${formatPrice(gld?.close)} (${formatSignedPct(gld?.change_pct, 2)}) | USO: ${formatPrice(uso?.close)} (${formatSignedPct(uso?.change_pct, 2)}) | TLT: ${formatPrice(tlt?.close)} (${formatSignedPct(tlt?.change_pct, 2)})`,
    `- EUR/USD: ${formatPrice(eurusd?.close, 4)} (${formatSignedPct(eurusd?.change_pct, 2)}) | USD/JPY: ${formatPrice(usdjpy?.close, 4)} (${formatSignedPct(usdjpy?.change_pct, 2)})`,
    `- SPY technical: above_MA50=${spyAboveMa50} | MA50=${formatPrice(spyMa50)} | ret_1m=${formatSignedPct(Number.isFinite(spyRet1m) ? spyRet1m * 100 : null, 2)} | vol_20d=${Number.isFinite(spyVol20d) ? `${(spyVol20d * 100).toFixed(1)}%` : 'n/a'}`,
    `- Market breadth: ${formatBreadth(breadth)} de símbolos sobre MA50`,
    `- Regime: ${regime?.regime || 'transition'} | Volatility: ${regime?.volatility_regime || 'normal'} | Confidence: ${Number.isFinite(Number(regime?.confidence)) ? `${(Number(regime.confidence) * 100).toFixed(0)}%` : 'n/a'}`,
    `- Leadership: ${Array.isArray(regime?.leadership) && regime.leadership.length ? regime.leadership.join(', ') : 'n/a'}`,
    `- Risk flags: ${Array.isArray(regime?.risk_flags) && regime.risk_flags.length ? regime.risk_flags.join(', ') : 'none'}`,
    '',
    'BIGGEST MOVERS (ABS CHANGE):',
    moversText || 'Sin movers relevantes',
    '',
    'NOTICIAS MACRO (ultimas 24h):',
    topHeadlines || 'Sin titulares',
    '',
    'CONTEXTO DEL USUARIO:',
    `- Perfil de riesgo: ${profile.risk_profile || 'moderado'}`,
    `- Horizonte: ${profile.horizon || 'mediano'}`,
    `- Sectores: ${Array.isArray(profile.sectors) && profile.sectors.length ? profile.sectors.join(', ') : 'sin preferencia'}`,
    `- Portfolio actual: posiciones=${portfolioSummary.positionsCount}, valor=${portfolioSummary.totalValue.toFixed(2)}`,
    '',
    'HISTORIAL DEL AGENTE:',
    `- Señales similares anteriores: ${Number(agentHistory.count || 0)}`,
    `- Win rate en señales similares: ${Number(agentHistory.hitRatePct || 0).toFixed(2)}%`,
    `- Última señal del agente: ${agentHistory.lastSignalSummary}`,
    '',
    'REGLAS DE CALIDAD:',
    '- Usa solo datos provistos arriba; no inventes valores.',
    '- Cada theme debe incluir al menos 2 números concretos (precio, % de cambio, breadth, volatilidad o confidence).',
    '- Cubre al menos 4 clases de activos entre equity, bonos, commodities, crypto y FX.',
    '- En relevance_to_user, conecta explícitamente con perfil/portfolio del usuario.',
    '- Evita frases vacías como "mercado mixto".',
    '',
    'BAD example: "Mercados mixtos y volatilidad."',
    'GOOD example: "SPY +0.8% a 542.30 con 63.4% de acciones sobre MA50, mientras BTC +2.1% y TLT -0.9% muestran apetito por riesgo con presión en duration."',
    '',
    'Responde en JSON estricto con este schema:',
    '{"market_sentiment":"bullish|neutral|bearish","sentiment_reasoning":"string","themes":[{"theme":"string","direction":"bullish|bearish","conviction":1,"timeframe":"1w|1m|3m|6m|1y","reasoning":"string","catalysts":["string"],"risks":["string"],"suggested_assets":[{"symbol":"string","name":"string","why":"string"}],"relevance_to_user":"string"}],"key_events_ahead":[{"event":"string","date":"YYYY-MM-DD","potential_impact":"string","assets_affected":["string"]}]}'
  ].join('\n');
};

const createMacroRadar = ({ query, finnhub, alpha, aiAgent = null, logger = console }) => {
  const fetchQuote = async (symbol) => {
    try {
      const out = await finnhub.quote(symbol);
      return {
        price: toFinite(out?.c),
        changePct: toFinite(out?.dp)
      };
    } catch {
      return { price: null, changePct: null };
    }
  };

  const fetchCommodity = async (fn, params = {}) => {
    try {
      const out = await alpha.commodity(fn, params);
      const row = Array.isArray(out?.data) ? out.data.find((item) => Number.isFinite(Number(item?.value))) : null;
      return row ? Number(row.value) : null;
    } catch {
      return null;
    }
  };

  const fetchMarketSnapshot = async () => {
    const [sp500, nasdaq, dow, btc, eth, eurusd, gbpusd, usdjpy, vix, gold, silver, oil] = await Promise.all([
      fetchQuote('SPY'),
      fetchQuote('QQQ'),
      fetchQuote('DIA'),
      fetchQuote('BINANCE:BTCUSDT'),
      fetchQuote('BINANCE:ETHUSDT'),
      fetchQuote('OANDA:EUR_USD'),
      fetchQuote('OANDA:GBP_USD'),
      fetchQuote('OANDA:USD_JPY'),
      fetchQuote('VIXM'),
      fetchCommodity('GOLD'),
      fetchCommodity('SILVER'),
      fetchCommodity('WTI')
    ]);

    return {
      indices: { sp500, nasdaq, dow },
      commodities: { gold, silver, oil },
      crypto: { btc: btc.price, eth: eth.price },
      fx: { eurusd: eurusd.price, gbpusd: gbpusd.price, usdjpy: usdjpy.price },
      vix: vix.price
    };
  };

  const getUserContext = async (userId) => {
    const [configOut, positionsOut, statsOut, latestOut] = await Promise.all([
      query('SELECT risk_profile, horizon, sectors FROM user_configs WHERE user_id = $1 LIMIT 1', [userId]),
      query('SELECT symbol, quantity, buy_price FROM positions WHERE user_id = $1 AND sell_date IS NULL AND deleted_at IS NULL', [userId]),
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
      config: configOut.rows?.[0] || {},
      portfolioSummary: summarizePortfolio(positionsOut.rows || []),
      positions: positionsOut.rows || [],
      agentHistory: buildAgentHistory({ stats: statsOut.rows?.[0] || {}, latest: latestInfo })
    };
  };

  const loadGlobalContext = async () => {
    const maxDateOut = await query('SELECT MAX(date)::text AS date FROM market_daily_bars');
    const marketDate = String(maxDateOut.rows?.[0]?.date || '').slice(0, 10);
    if (!marketDate) {
      return {
        date: null,
        benchmarks: [],
        movers: [],
        breadth: null,
        regime: null,
        news: []
      };
    }

    const benchmarkSymbols = ['SPY', 'QQQ', 'DIA', 'IWM', 'BTCUSDT', 'ETHUSDT', 'GLD', 'USO', 'TLT', 'EUR_USD', 'USD_JPY', 'SMH', 'XLF', 'XLE', 'XLK'];
    const [benchmarksOut, moversOut, breadthOut, regimeOut, newsOut] = await Promise.all([
      query(
        `SELECT b.symbol,
                COALESCE(u.name, b.symbol) AS name,
                b.close,
                CASE WHEN prev.close IS NULL OR prev.close = 0 THEN NULL ELSE ((b.close - prev.close) / prev.close) * 100 END AS change_pct,
                m.ma50,
                m.vol_20d,
                m.ret_1m
         FROM market_daily_bars b
         LEFT JOIN market_metrics_daily m ON m.symbol = b.symbol AND m.date = b.date
         LEFT JOIN universe_symbols u ON u.symbol = b.symbol
         LEFT JOIN LATERAL (
           SELECT close
           FROM market_daily_bars p
           WHERE p.symbol = b.symbol
             AND p.date < b.date
           ORDER BY p.date DESC
           LIMIT 1
         ) prev ON TRUE
         WHERE b.date = $1
           AND b.symbol = ANY($2::text[])`,
        [marketDate, benchmarkSymbols]
      ),
      query(
        `SELECT b.symbol,
                COALESCE(u.name, b.symbol) AS name,
                b.close,
                CASE WHEN prev.close IS NULL OR prev.close = 0 THEN NULL ELSE ((b.close - prev.close) / prev.close) * 100 END AS change_pct,
                COALESCE(u.asset_type, 'unknown') AS category
         FROM market_daily_bars b
         LEFT JOIN universe_symbols u ON u.symbol = b.symbol
         LEFT JOIN LATERAL (
           SELECT close
           FROM market_daily_bars p
           WHERE p.symbol = b.symbol
             AND p.date < b.date
           ORDER BY p.date DESC
           LIMIT 1
         ) prev ON TRUE
         WHERE b.date = $1
         ORDER BY ABS(CASE WHEN prev.close IS NULL OR prev.close = 0 THEN 0 ELSE ((b.close - prev.close) / prev.close) * 100 END) DESC
         LIMIT 10`,
        [marketDate]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE b.close > m.ma50)::float / NULLIF(COUNT(*), 0) * 100 AS pct_above_ma50
         FROM market_daily_bars b
         JOIN market_metrics_daily m ON m.symbol = b.symbol AND m.date = b.date
         WHERE b.date = $1
           AND m.ma50 IS NOT NULL`,
        [marketDate]
      ),
      query(
        `SELECT regime, volatility_regime, leadership, risk_flags, confidence
         FROM regime_state
         WHERE date = $1
         LIMIT 1`,
        [marketDate]
      ),
      query(
        `SELECT headline,
                source,
                COALESCE(raw->>'category', 'general') AS category,
                tickers
         FROM news_items
         WHERE ts >= ($1::date - INTERVAL '1 day')
           AND ts < ($1::date + INTERVAL '1 day')
         ORDER BY ts DESC
         LIMIT 30`,
        [marketDate]
      )
    ]);

    return {
      date: marketDate,
      benchmarks: benchmarksOut.rows || [],
      movers: moversOut.rows || [],
      breadth: breadthOut.rows?.[0] || null,
      regime: regimeOut.rows?.[0] || null,
      news: newsOut.rows || []
    };
  };

  const persistInsight = async ({ userId, insight, model }) => {
    const inserted = await query(
      `INSERT INTO macro_insights (user_id, market_sentiment, sentiment_reasoning, themes, key_events, ai_model)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
       RETURNING id, user_id, market_sentiment, sentiment_reasoning, themes, key_events, ai_model, created_at`,
      [
        userId,
        coerceSentiment(insight.market_sentiment),
        String(insight.sentiment_reasoning || ''),
        JSON.stringify(safeThemes(insight.themes)),
        JSON.stringify(safeEvents(insight.key_events || insight.key_events_ahead)),
        model || null
      ]
    );
    return inserted.rows[0];
  };

  const generateForUser = async (userId) => {
    const [market, userContext, news, globalContext] = await Promise.all([
      fetchMarketSnapshot(),
      getUserContext(userId),
      finnhub.generalNews('general', 0).catch(() => []),
      loadGlobalContext().catch(() => ({ date: null, benchmarks: [], movers: [], breadth: null, regime: null, news: [] }))
    ]);
    const contextualHeadlines = Array.isArray(globalContext?.news) && globalContext.news.length ? globalContext.news : safeArray(news);

    let insight = null;
    let model = null;
    let usage = null;
    let durationMs = 0;
    const startedAt = Date.now();

    if (aiAgent?.configured && env.aiAgentEnabled && env.anthropicApiKey) {
      try {
        const response = await aiAgent.callAnthropic({
          apiKey: env.anthropicApiKey,
          model: env.aiAgentModel,
          timeoutMs: env.aiAgentTimeoutMs,
          systemPrompt: 'Sos un estratega macro del equipo de Horsai. Responde solo JSON.',
          userPrompt: buildPrompt({ market, globalContext, headlines: contextualHeadlines, userContext })
        });
        usage = response?.raw?.usage || null;
        const parsed = extractJsonBlock(response.text);
        if (parsed) {
          insight = {
            market_sentiment: coerceSentiment(parsed.market_sentiment),
            sentiment_reasoning: String(parsed.sentiment_reasoning || ''),
            themes: safeThemes(parsed.themes),
            key_events: safeEvents(parsed.key_events_ahead || parsed.key_events)
          };
          model = env.aiAgentModel;
        }
      } catch (error) {
        logger.warn?.('[macroRadar] ai generation fallback', error?.message || error);
      }
    }

    if (!insight) {
      insight = buildFallbackInsight({ market, userContext });
    }

    const row = await persistInsight({ userId, insight, model });
    durationMs = Date.now() - startedAt;
    await logAiUsage({
      query,
      userId,
      feature: 'macro_radar',
      model: model || env.aiAgentModel,
      usage,
      success: Boolean(model),
      durationMs
    });
    return {
      ...row,
      source: model ? 'ai' : 'fallback'
    };
  };

  const getLatestForUser = async (userId) => {
    const out = await query(
      `SELECT id, user_id, market_sentiment, sentiment_reasoning, themes, key_events, ai_model, created_at
       FROM macro_insights
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    return out.rows?.[0] || null;
  };

  const runGlobalDaily = async () => {
    const users = await query('SELECT id FROM users ORDER BY created_at ASC');
    const rows = [];
    for (const user of users.rows) {
      try {
        const out = await generateForUser(user.id);
        rows.push(out);
      } catch (error) {
        logger.warn?.(`[macroRadar] failed for user ${user.id}`, error?.message || error);
      }
    }
    return { usersScanned: users.rows.length, generated: rows.length };
  };

  return {
    generateForUser,
    getLatestForUser,
    runGlobalDaily
  };
};

module.exports = { createMacroRadar };
