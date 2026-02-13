const http = require('http');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const { env } = require('./config/env');
const { query } = require('./config/db');
const { authRequired } = require('./middleware/auth');
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

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: false,
    exposedHeaders: ['X-Refresh-Token']
  })
);
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
app.use('/api/portfolio', authRequired, portfolioRoutes);
app.use('/api/config', authRequired, configRoutes);
app.use('/api/watchlist', authRequired, watchlistRoutes);
app.use('/api/groups', authRequired, groupsRoutes);
app.use('/api/alerts', authRequired, alertsRoutes);
app.use('/api/notifications', authRequired, notificationsRoutes);
app.use('/api/migrate', authRequired, migrateRoutes);

app.use(errorHandler);

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

  server.listen(port, () => {
    console.log(`nexusfin-api listening on :${port}`);
    console.log(`ws hub ready on :${port}/ws`);
    console.log(`cron ${cronRuntime.enabled ? 'enabled' : 'disabled'}`);
    console.log(`push ${pushNotifier.hasVapidConfig ? 'enabled' : 'disabled'}`);
  });

  const shutdown = () => {
    cronRuntime.stop();
    wsHub.close().catch(() => {});
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, wsHub, cronRuntime, alertEngine, pushNotifier };
};

if (require.main === module) {
  startHttpServer();
}

module.exports = { app, startHttpServer };
