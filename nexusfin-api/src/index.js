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

const startWsPriceRuntime = ({ wsHub, finnhubSvc, logger = console, intervalSeconds = env.wsPriceIntervalSeconds }) => {
  const intervalMs = Math.max(5000, Number(intervalSeconds || 20) * 1000);
  let inFlight = false;

  const runCycle = async () => {
    if (inFlight) return;
    inFlight = true;

    try {
      const symbols = wsHub.getSubscribedSymbols();
      if (!symbols.length) return;

      for (const symbol of symbols) {
        try {
          const quote = await finnhubSvc.quote(symbol);
          const price = Number(quote?.c);
          if (!Number.isFinite(price) || price <= 0) continue;
          wsHub.broadcastPrice({
            symbol,
            price,
            change: Number.isFinite(Number(quote?.dp)) ? Number(quote.dp) : null,
            timestamp: Date.now()
          });
        } catch (error) {
          logger.warn?.(`[ws-price] quote failed (${symbol})`, error?.message || error);
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

module.exports = { app, startHttpServer, startWsPriceRuntime };
