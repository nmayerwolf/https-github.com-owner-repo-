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
const { createAlertEngine } = require('./services/alertEngine');
const { createPushNotifier } = require('./services/push');

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
const MACRO_SYMBOL_TO_REQUEST = {
  'AV:GOLD': { fn: 'GOLD' },
  'AV:SILVER': { fn: 'SILVER' },
  'AV:WTI': { fn: 'WTI' },
  'AV:TREASURY_YIELD:10YEAR': { fn: 'TREASURY_YIELD', params: { maturity: '10year' } }
};
const AV_SYMBOL_PREFIX = 'AV:';

const app = express();

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

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    return res.json({ ok: true, db: 'up', ts: new Date().toISOString() });
  } catch {
    return res.status(500).json({ ok: false, db: 'down' });
  }
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

const resolveRealtimeQuote = async (symbol, { finnhubSvc, alphaSvc }) => {
  const upper = String(symbol || '').trim().toUpperCase();
  if (!upper) return null;

  const macroRequest = MACRO_SYMBOL_TO_REQUEST[upper];
  if (macroRequest) {
    const raw = await alphaSvc.commodity(macroRequest.fn, macroRequest.params || {});
    const price = extractLatestAVValue(raw);
    if (!Number.isFinite(price)) return null;
    return { symbol: upper, price, change: null, provider: 'alphavantage' };
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

const startWsPriceRuntime = ({ wsHub, finnhubSvc, alphaSvc = av, logger = console, intervalSeconds = env.wsPriceIntervalSeconds }) => {
  const intervalMs = Math.max(5000, Number(intervalSeconds || 20) * 1000);
  const avMinPollMs = 65 * 1000;
  const errorCooldownMs = 30 * 1000;
  const heartbeatMs = 60 * 1000;
  let inFlight = false;
  const stateBySymbol = new Map();

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
      const symbols = wsHub.getSubscribedSymbols();
      if (!symbols.length) return;

      const now = Date.now();
      for (const symbol of symbols) {
        const upper = String(symbol || '').toUpperCase();
        const provider = providerForRealtimeSymbol(upper);
        const symbolState = stateBySymbol.get(upper) || {};
        const minPollMs = provider === 'alphavantage' ? Math.max(intervalMs, avMinPollMs) : intervalMs;
        const nextAllowedAt = Number(symbolState.nextAllowedAt || 0);
        if (now < nextAllowedAt) continue;

        try {
          const out = await resolveRealtimeQuote(upper, { finnhubSvc, alphaSvc });
          if (!out) continue;

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
            nextState.lastBroadcastPrice = out.price;
            nextState.lastBroadcastAt = now;
          }

          stateBySymbol.set(upper, nextState);
        } catch (error) {
          const errorCount = Number(symbolState.errorCount || 0) + 1;
          stateBySymbol.set(upper, {
            ...symbolState,
            provider,
            errorCount,
            nextAllowedAt: now + errorCooldownMs
          });
          logger.warn?.(`[ws-price] quote failed (${upper})`, error?.message || error);
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
    stop: () => clearInterval(timer)
  };
};

const startHttpServer = ({ port = env.port } = {}) => {
  const server = http.createServer(app);
  const wsHub = startWSHub(server);
  const pushNotifier = createPushNotifier({ query, logger: console });

  const alertEngine = createAlertEngine({ query, finnhub, wsHub, pushNotifier, logger: console });
  const cronTasks = buildTasks(env, {
    us: () => alertEngine.runGlobalCycle(),
    crypto: () => alertEngine.runGlobalCycle(),
    forex: () => alertEngine.runGlobalCycle(),
    commodity: () => alertEngine.runGlobalCycle()
  });
  const cronRuntime = startMarketCron({ tasks: cronTasks, logger: console });
  const wsPriceRuntime = startWsPriceRuntime({ wsHub, finnhubSvc: finnhub, logger: console });

  server.listen(port, () => {
    console.log(`nexusfin-api listening on :${port}`);
    console.log(`ws hub ready on :${port}/ws`);
    console.log(`ws prices enabled (${wsPriceRuntime.intervalMs}ms)`);
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

  return { server, wsHub, cronRuntime, wsPriceRuntime, alertEngine, pushNotifier };
};

if (require.main === module) {
  startHttpServer();
}

module.exports = { app, startHttpServer, startWsPriceRuntime, resolveRealtimeQuote, extractLatestAVValue };
