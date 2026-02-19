const http = require('http');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const { env } = require('./config/env');
const { query } = require('./config/db');
const { authRequired, requireCsrf } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { authLimiter, marketLimiter } = require('./middleware/rateLimiter');
const { startWSHub } = require('./realtime/wsHub');
const { startMarketCron, buildTasks } = require('./workers/marketCron');
const finnhub = require('./services/finnhub');
const av = require('./services/alphavantage');
const { resolveMarketQuote } = require('./services/marketDataProvider');
const { createAlertEngine } = require('./services/alertEngine');
const { createAiAgent } = require('./services/aiAgent');
const { createPushNotifier } = require('./services/push');
const { createMacroRadar } = require('./services/macroRadar');
const { createPortfolioAdvisor } = require('./services/portfolioAdvisor');

const authRoutes = require('./routes/auth');
const portfolioRoutes = require('./routes/portfolio');
const configRoutes = require('./routes/config');
const watchlistRoutes = require('./routes/watchlist');
const marketRoutes = require('./routes/market');
const groupsRoutes = require('./routes/groups');
const migrateRoutes = require('./routes/migrate');
const alertsRoutes = require('./routes/alerts');
const notificationsRoutes = require('./routes/notifications');
const exportRoutes = require('./routes/export');
const { MARKET_UNIVERSE } = require('./constants/marketUniverse');
const MACRO_SYMBOL_TO_REQUEST = {
  'AV:GOLD': { fn: 'GOLD' },
  'AV:SILVER': { fn: 'SILVER' },
  'AV:PLATINUM': { fn: 'PLATINUM' },
  'AV:COPPER': { fn: 'COPPER' },
  'AV:WTI': { fn: 'WTI' },
  'AV:BRENT': { fn: 'BRENT' },
  'AV:NATURAL_GAS': { fn: 'NATURAL_GAS' },
  'AV:TREASURY_YIELD:2YEAR': { fn: 'TREASURY_YIELD', params: { maturity: '2year' } },
  'AV:TREASURY_YIELD:5YEAR': { fn: 'TREASURY_YIELD', params: { maturity: '5year' } },
  'AV:TREASURY_YIELD:10YEAR': { fn: 'TREASURY_YIELD', params: { maturity: '10year' } },
  'AV:TREASURY_YIELD:30YEAR': { fn: 'TREASURY_YIELD', params: { maturity: '30year' } }
};
const AV_SYMBOL_PREFIX = 'AV:';

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
    exposedHeaders: ['X-Refresh-Token']
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.locals.getWsPriceStatus = () => ({ enabled: false, intervalMs: 0, metrics: {} });
app.locals.getCronStatus = () => ({
  enabled: false,
  lastRun: null,
  lastDuration: 0,
  symbolsScanned: 0,
  candidatesFound: 0,
  aiValidations: 0,
  aiConfirmations: 0,
  aiRejections: 0,
  aiFailures: 0,
  alertsGenerated: 0,
  stopLossChecked: 0,
  nextRun: null,
  errors: [],
  lastTask: null,
  macroRuns: 0,
  portfolioRuns: 0
});
app.locals.getMobileHealthStatus = () => ({
  ok: true,
  ws: {
    enabled: Boolean(env.realtimeEnabled),
    intervalMs: Math.max(5000, Number(env.wsPriceIntervalSeconds || 20) * 1000)
  },
  push: {
    web: false,
    expo: Boolean(env.expoAccessToken)
  },
  auth: {
    appleConfigured: Boolean(env.appleClientId && env.appleCallbackUrl && env.appleTeamId && env.appleKeyId && env.applePrivateKey)
  },
  ts: new Date().toISOString()
});

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    const revision = String(
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.SOURCE_VERSION ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      ''
    ).trim();
    return res.json({
      ok: true,
      db: 'up',
      revision: revision || null,
      ts: new Date().toISOString()
    });
  } catch {
    return res.status(500).json({ ok: false, db: 'down' });
  }
});

app.get('/api/health/realtime', authRequired, (req, res) => {
  const status = app.locals.getWsPriceStatus?.();
  return res.json(status || { enabled: false, intervalMs: 0, metrics: {} });
});

app.get('/api/health/mobile', (_req, res) => {
  const status = app.locals.getMobileHealthStatus?.();
  return res.json(
    status || {
      ok: true,
      ws: { enabled: Boolean(env.realtimeEnabled), intervalMs: Math.max(5000, Number(env.wsPriceIntervalSeconds || 20) * 1000) },
      push: { web: false, expo: Boolean(env.expoAccessToken) },
      auth: {
        appleConfigured: Boolean(env.appleClientId && env.appleCallbackUrl && env.appleTeamId && env.appleKeyId && env.applePrivateKey)
      },
      ts: new Date().toISOString()
    }
  );
});

app.get('/api/health/phase3', (_req, res) => {
  const wsIntervalMs = Math.max(5000, Number(env.wsPriceIntervalSeconds || 20) * 1000);
  const check = {
    mobileOAuth: Boolean(env.appleClientId && env.appleCallbackUrl && env.appleTeamId && env.appleKeyId && env.applePrivateKey),
    expoPush: Boolean(env.expoAccessToken),
    realtimeWs: Boolean(env.realtimeEnabled) && wsIntervalMs >= 5000,
    marketUniverse: Array.isArray(MARKET_UNIVERSE) && MARKET_UNIVERSE.length >= 30,
    exportPdf: true,
    groupsSocial: true
  };
  const score = Object.values(check).filter(Boolean).length;
  const total = Object.keys(check).length;

  return res.json({
    ok: score === total,
    score,
    total,
    check,
    ts: new Date().toISOString()
  });
});

app.get('/api/health/market-data', async (_req, res) => {
  const symbols = new Set((MARKET_UNIVERSE || []).map((item) => String(item?.symbol || '').toUpperCase()));
  const probes = {};
  for (const probeSymbol of ['AAPL', 'EUR_USD']) {
    try {
      const startedAt = Date.now();
      const out = await resolveMarketQuote(probeSymbol);
      probes[probeSymbol] = {
        ok: true,
        price: Number(out?.quote?.c) || null,
        duration_ms: Date.now() - startedAt
      };
    } catch (error) {
      probes[probeSymbol] = {
        ok: false,
        code: error?.code || 'UNKNOWN',
        message: error?.message || 'failed',
        details: error?.details || null
      };
    }
  }

  return res.json({
    ok: true,
    providerMode: 'finnhub-polling',
    keyPresent: Boolean(String(env.finnhubKey || '').trim()),
    keyLength: String(env.finnhubKey || '').trim().length,
    universe: {
      count: symbols.size,
      hasMerval: symbols.has('^MERV'),
      hasGoldSpot: symbols.has('XAU_USD')
    },
    ws: { chainResolverEnabled: true },
    strictRealtime: Boolean(env.marketStrictRealtime),
    probes,
    ts: new Date().toISOString()
  });
});

app.get('/api/health/cron', (_req, res) => {
  const status = app.locals.getCronStatus?.();
  return res.json(
    status || {
      enabled: false,
      lastRun: null,
      lastDuration: 0,
      symbolsScanned: 0,
      candidatesFound: 0,
      aiValidations: 0,
      aiConfirmations: 0,
      aiRejections: 0,
      aiFailures: 0,
      alertsGenerated: 0,
      stopLossChecked: 0,
      nextRun: null,
      errors: [],
      lastTask: null,
      macroRuns: 0,
      portfolioRuns: 0
    }
  );
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/market', authRequired, marketLimiter, marketRoutes);
app.use('/api/portfolio', authRequired, requireCsrf, portfolioRoutes);
app.use('/api/config', authRequired, requireCsrf, configRoutes);
app.use('/api/watchlist', authRequired, requireCsrf, watchlistRoutes);
app.use('/api/groups', authRequired, requireCsrf, groupsRoutes);
app.use('/api/alerts', authRequired, requireCsrf, alertsRoutes);
app.use('/api/notifications', authRequired, requireCsrf, notificationsRoutes);
app.use('/api/export', authRequired, requireCsrf, exportRoutes);
app.use('/api/migrate', authRequired, requireCsrf, migrateRoutes);

app.use(errorHandler);

const extractLatestAVValue = (payload) => {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  for (const row of rows) {
    const value = Number(row?.value);
    if (Number.isFinite(value)) return value;
  }
  return null;
};

const providerForRealtimeSymbol = (symbol) =>
  String(symbol || '')
    .toUpperCase()
    .startsWith(AV_SYMBOL_PREFIX)
    ? 'alphavantage'
    : 'finnhub';

const canonicalSymbolFromRealtime = (symbol) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;
  if (upper.startsWith('BINANCE:')) return upper.slice('BINANCE:'.length);
  if (upper.startsWith('OANDA:')) return upper.slice('OANDA:'.length);
  return upper;
};

const resolveRealtimeQuote = async (symbol, { finnhubSvc, alphaSvc, quoteResolver = null }) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;

  const macroRequest = MACRO_SYMBOL_TO_REQUEST[upper];
  if (macroRequest) {
    const raw = await alphaSvc.commodity(macroRequest.fn, macroRequest.params || {});
    const price = extractLatestAVValue(raw);
    if (!Number.isFinite(price)) return null;
    return { symbol: upper, price, change: null, provider: 'alphavantage' };
  }

  if (typeof quoteResolver === 'function') {
    const canonical = canonicalSymbolFromRealtime(upper);
    if (!canonical) return null;
    const resolved = await quoteResolver(canonical);
    const price = Number(resolved?.quote?.c);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      symbol: upper,
      price,
      change: Number.isFinite(Number(resolved?.quote?.dp)) ? Number(resolved.quote.dp) : null,
      provider: String(resolved?.meta?.source || 'market-chain')
    };
  }

  const quote = await finnhubSvc.quote(upper);
  const price = Number(quote?.c);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    symbol: upper,
    price,
    change: Number.isFinite(Number(quote?.dp)) ? Number(quote.dp) : null,
    provider: 'finnhub'
  };
};

const startWsPriceRuntime = ({
  wsHub,
  finnhubSvc,
  alphaSvc = av,
  quoteResolver = null,
  logger = console,
  intervalSeconds = env.wsPriceIntervalSeconds
}) => {
  const intervalMs = Math.max(5000, Number(intervalSeconds || 20) * 1000);
  const avMinPollMs = 65 * 1000;
  const errorCooldownMs = 30 * 1000;
  const finnhubBackoffMaxMs = 5 * 60 * 1000;
  const heartbeatMs = 60 * 1000;
  let inFlight = false;
  let finnhubBlockedUntil = 0;
  let lastFinnhubBlockedLogAt = 0;
  const stateBySymbol = new Map();
  const metrics = {
    cycles: 0,
    symbolsSeen: 0,
    quotesResolved: 0,
    quotesFailed: 0,
    broadcastsSent: 0,
    broadcastsSuppressed: 0,
    cooldownSkips: 0,
    lastCycleAt: null
  };

  const shouldBroadcast = (state, price, now) => {
    if (!state || !Number.isFinite(state.lastBroadcastPrice)) return true;
    const changed = Math.abs(Number(price) - Number(state.lastBroadcastPrice)) > 1e-9;
    if (changed) return true;
    return now - Number(state.lastBroadcastAt || 0) >= heartbeatMs;
  };

  const runCycle = async () => {
    if (inFlight) return;
    inFlight = true;

    try {
      metrics.cycles += 1;
      metrics.lastCycleAt = new Date().toISOString();
      const symbols = wsHub.getSubscribedSymbols();
      if (!symbols.length) return;

      const now = Date.now();
      for (const symbol of symbols) {
        metrics.symbolsSeen += 1;
        const upper = String(symbol || '').toUpperCase();
        const provider = providerForRealtimeSymbol(upper);
        const symbolState = stateBySymbol.get(upper) || {};
        if (provider === 'finnhub' && now < finnhubBlockedUntil) {
          metrics.cooldownSkips += 1;
          continue;
        }
        const minPollMs = provider === 'alphavantage' ? Math.max(intervalMs, avMinPollMs) : intervalMs;
        const nextAllowedAt = Number(symbolState.nextAllowedAt || 0);
        if (now < nextAllowedAt) {
          metrics.cooldownSkips += 1;
          continue;
        }

        try {
          const out = await resolveRealtimeQuote(upper, { finnhubSvc, alphaSvc, quoteResolver });
          if (!out) continue;
          metrics.quotesResolved += 1;

          const nextState = {
            ...symbolState,
            provider,
            errorCount: 0,
            nextAllowedAt: Date.now() + minPollMs
          };

          if (shouldBroadcast(symbolState, out.price, now)) {
            wsHub.broadcastPrice({
              symbol: out.symbol,
              price: out.price,
              change: out.change,
              timestamp: now
            });
            metrics.broadcastsSent += 1;
            nextState.lastBroadcastPrice = out.price;
            nextState.lastBroadcastAt = now;
          } else {
            metrics.broadcastsSuppressed += 1;
          }

          stateBySymbol.set(upper, nextState);
        } catch (error) {
          metrics.quotesFailed += 1;
          if (provider === 'finnhub' && (error?.code === 'FINNHUB_ENDPOINT_FORBIDDEN' || error?.code === 'FINNHUB_RATE_LIMIT')) {
            const retryAfterMs = Number(error?.retryAfterMs);
            const backoffMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? Math.min(retryAfterMs, finnhubBackoffMaxMs) : errorCooldownMs;
            finnhubBlockedUntil = Math.max(finnhubBlockedUntil, now + backoffMs);
            if (now - lastFinnhubBlockedLogAt > 30 * 1000) {
              logger.warn?.(`[ws-price] finnhub backoff ${Math.ceil(backoffMs / 1000)}s`, error?.message || error);
              lastFinnhubBlockedLogAt = now;
            }
          }
          const errorCount = Number(symbolState.errorCount || 0) + 1;
          stateBySymbol.set(upper, {
            ...symbolState,
            provider,
            errorCount,
            nextAllowedAt: now + errorCooldownMs
          });
          if (!error?.silent) logger.warn?.(`[ws-price] quote failed (${upper})`, error?.message || error);
        }
      }
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(runCycle, intervalMs);

  return {
    enabled: true,
    intervalMs,
    stop: () => clearInterval(timer),
    getStatus: () => ({
      enabled: true,
      intervalMs,
      activeSymbols: wsHub.getSubscribedSymbols?.() || [],
      metrics: { ...metrics }
    })
  };
};

const createNoopWsHub = () => ({
  getSubscribedSymbols: () => [],
  broadcastPrice: () => {},
  broadcastAlert: () => {},
  close: async () => {}
});

const startHttpServer = ({ port = env.port } = {}) => {
  const server = http.createServer(app);
  const wsHub = env.realtimeEnabled ? startWSHub(server) : createNoopWsHub();
  const pushNotifier = createPushNotifier({ query, logger: console });
  const aiAgent = createAiAgent();
  const macroRadar = createMacroRadar({ query, finnhub, alpha: av, aiAgent, logger: console });
  const portfolioAdvisor = createPortfolioAdvisor({ query, aiAgent, logger: console });
  app.locals.macroRadar = macroRadar;
  app.locals.portfolioAdvisor = portfolioAdvisor;

  const alertEngine = createAlertEngine({ query, finnhub, wsHub, pushNotifier, aiAgent, logger: console });
  const runMarketCycleWithOutcome = async (options) => {
    const cycle = await alertEngine.runGlobalCycle({
      ...options,
      enableDiscoverySignals: true,
      maxAlertsPerUserPerDay: env.aiAgentMaxAlertsPerUserPerDay,
      rejectionCooldownHours: env.aiAgentRejectionCooldownHours,
      rejectionThreshold: 3
    });
    const outcomes = await alertEngine.runOutcomeEvaluationCycle();
    return {
      ...cycle,
      outcomesUpdated: outcomes.updated,
      outcomeWins: outcomes.wins,
      outcomeLosses: outcomes.losses
    };
  };
  const cronTasks = buildTasks(env, {
    us: () => runMarketCycleWithOutcome({ categories: ['equity', 'etf', 'bond', 'metal', 'commodity'], includeStopLoss: true }),
    crypto: () => runMarketCycleWithOutcome({ categories: ['crypto'], includeStopLoss: false }),
    forex: () => runMarketCycleWithOutcome({ categories: ['fx'], includeStopLoss: false }),
    commodity: () => runMarketCycleWithOutcome({ categories: ['commodity', 'metal', 'bond'], includeStopLoss: false }),
    macroDaily: () => macroRadar.runGlobalDaily(),
    portfolioDaily: () => portfolioAdvisor.runGlobalDaily()
  });
  const logCronRun = async ({
    event,
    runId,
    task,
    startedAt,
    finishedAt,
    durationMs,
    symbolsScanned,
    candidatesFound,
    aiValidations,
    aiConfirmations,
    aiRejections,
    aiFailures,
    alertsGenerated,
    stopLossChecked,
    errors
  }) => {
    try {
      if (event === 'start') {
        const inserted = await query(
          `INSERT INTO cron_runs
            (started_at, symbols_scanned, candidates_found, ai_validations, ai_confirmations, ai_rejections, ai_failures, alerts_generated, stop_losses_checked, errors)
           VALUES
            ($1, 0, 0, 0, 0, 0, 0, 0, 0, '[]'::jsonb)
           RETURNING id`,
          [startedAt]
        );
        return inserted.rows?.[0]?.id || null;
      }

      if (!runId) return null;

      await query(
        `UPDATE cron_runs
         SET finished_at = $2,
             duration_ms = $3,
             symbols_scanned = $4,
             candidates_found = $5,
             ai_validations = $6,
             ai_confirmations = $7,
             ai_rejections = $8,
             ai_failures = $9,
             alerts_generated = $10,
             stop_losses_checked = $11,
             errors = $12::jsonb
         WHERE id = $1`,
        [
          runId,
          finishedAt,
          durationMs,
          symbolsScanned || 0,
          candidatesFound || 0,
          aiValidations || 0,
          aiConfirmations || 0,
          aiRejections || 0,
          aiFailures || 0,
          alertsGenerated || 0,
          stopLossChecked || 0,
          JSON.stringify(errors || [])
        ]
      );
      return runId;
    } catch (error) {
      // Keep cron runtime active even if cron_runs table is missing.
      console.warn('[cron] run log skipped', error?.message || error);
      return null;
    }
  };
  const cronRuntime = startMarketCron({ tasks: cronTasks, logger: console, logRun: logCronRun });
  app.locals.getCronStatus = cronRuntime.getStatus;
  const wsPriceRuntime = env.realtimeEnabled
    ? startWsPriceRuntime({
        wsHub,
        finnhubSvc: finnhub,
        alphaSvc: av,
        quoteResolver: (symbol) => resolveMarketQuote(symbol, { strictRealtime: env.marketStrictRealtime }),
        logger: console
      })
    : {
        enabled: false,
        intervalMs: 0,
        stop: () => {},
        getStatus: () => ({ enabled: false, intervalMs: 0, activeSymbols: [], metrics: {} })
      };
  app.locals.getWsPriceStatus = wsPriceRuntime.getStatus;
  app.locals.getMobileHealthStatus = () => ({
    ok: true,
    ws: {
      enabled: Boolean(env.realtimeEnabled),
      intervalMs: wsPriceRuntime.intervalMs,
      activeSymbols: wsHub.getSubscribedSymbols?.() || []
    },
    push: {
      web: pushNotifier.hasVapidConfig,
      expo: Boolean(env.expoAccessToken)
    },
    auth: {
      appleConfigured: Boolean(env.appleClientId && env.appleCallbackUrl && env.appleTeamId && env.appleKeyId && env.applePrivateKey)
    },
    ts: new Date().toISOString()
  });

  server.listen(port, () => {
    console.log(`nexusfin-api listening on :${port}`);
    if (env.realtimeEnabled) {
      console.log(`ws hub ready on :${port}/ws`);
      console.log(`ws prices enabled (${wsPriceRuntime.intervalMs}ms)`);
    } else {
      console.log('ws realtime disabled (REALTIME_ENABLED=false)');
    }
    console.log(`cron ${cronRuntime.enabled ? 'enabled' : 'disabled'}`);
    console.log(`push ${pushNotifier.hasVapidConfig ? 'enabled' : 'disabled'}`);
  });

  const shutdown = () => {
    cronRuntime.stop();
    wsPriceRuntime.stop();
    wsHub.close().catch(() => {});
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, wsHub, cronRuntime, wsPriceRuntime, alertEngine, pushNotifier, macroRadar, portfolioAdvisor };
};

if (require.main === module) {
  startHttpServer();
}

module.exports = { app, startHttpServer, startWsPriceRuntime, resolveRealtimeQuote, extractLatestAVValue };
