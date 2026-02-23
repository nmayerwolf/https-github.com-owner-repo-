const http = require('http');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const { env } = require('./config/env');
const { query } = require('./config/db');
const { authRequired, requireCsrf } = require('./middleware/auth');
const { requireAdmin } = require('./middleware/requireAdmin');
const { errorHandler } = require('./middleware/errorHandler');
const {
  apiLimiter,
  authLimiter,
  authLoginLimiter,
  authRegisterLimiter,
  adminJobsLimiter
} = require('./middleware/rateLimiter');

const { startMarketCron, buildTasks } = require('./workers/marketCron');
const { createMarketIngestionV1Service } = require('./services/marketIngestionV1');
const { createBriefGenerator } = require('./services/briefGenerator');
const { createIdeasDailyPipeline } = require('./services/ideasDailyPipeline');
const { createPortfolioEngine } = require('./services/portfolioEngine');

const authRoutes = require('./routes/auth');
const portfolioRoutes = require('./routes/portfolio');
const adminJobsRoutes = require('./routes/adminJobs');
const adminRoutes = require('./routes/admin');
const briefRoutes = require('./routes/brief');
const ideasRoutes = require('./routes/ideas');
const packagesRoutes = require('./routes/packages');

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
app.use('/api', apiLimiter);

app.locals.getCronStatus = () => ({ enabled: false, lastRun: null, results: {}, errors: [] });

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    return res.json({ ok: true, db: 'up', ts: new Date().toISOString() });
  } catch {
    return res.status(500).json({ ok: false, db: 'down' });
  }
});

app.get('/api/health/cron', (_req, res) => {
  return res.json(app.locals.getCronStatus?.() || { enabled: false, lastRun: null, results: {}, errors: [] });
});

app.use('/api/auth/login', authLoginLimiter);
app.use('/api/auth/register', authRegisterLimiter);
app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/brief', authRequired, requireCsrf, briefRoutes);
app.use('/api/ideas', authRequired, requireCsrf, ideasRoutes);
app.use('/api/packages', authRequired, requireCsrf, packagesRoutes);
app.use('/api/portfolio', authRequired, requireCsrf, portfolioRoutes);
app.use('/api/admin/jobs', authRequired, requireCsrf, adminJobsLimiter, adminJobsRoutes);
app.use('/api/admin', authRequired, requireCsrf, requireAdmin, adminRoutes);

app.use(errorHandler);

const startHttpServer = ({ port = env.port } = {}) => {
  const server = http.createServer(app);

  const marketIngestionService = createMarketIngestionV1Service({ query });
  const briefGenerator = createBriefGenerator({ query, logger: console });
  const ideasDailyPipeline = createIdeasDailyPipeline({ query, logger: console });
  const portfolioEngine = createPortfolioEngine({ query, logger: console });

  app.locals.marketIngestionService = marketIngestionService;
  app.locals.briefGenerator = briefGenerator;
  app.locals.ideasDailyPipeline = ideasDailyPipeline;
  app.locals.portfolioEngine = portfolioEngine;

  const cronTasks = buildTasks(env, {
    dataIngestion: () => marketIngestionService.runIngestion({}),
    briefAndIdeasReview: async () => {
      const brief = await briefGenerator.generateBrief({});
      const reviewed = await ideasDailyPipeline.reviewIdeas({ date: brief.date });
      return { briefDate: brief.date, reviewed };
    }
  });

  const cronRuntime = startMarketCron({ tasks: cronTasks, logger: console });
  app.locals.getCronStatus = cronRuntime.getStatus;

  server.listen(port, () => {
    console.log(`nexusfin-api listening on :${port}`);
    console.log(`cron ${cronRuntime.enabled ? 'enabled' : 'disabled'} (${env.cronTimezone || 'America/Argentina/Buenos_Aires'})`);
  });

  const shutdown = () => {
    cronRuntime.stop();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, cronRuntime };
};

const startWsPriceRuntime = () => ({ enabled: false, intervalMs: 0, stop: () => {}, getStatus: () => ({ enabled: false, metrics: {} }) });

if (require.main === module) {
  startHttpServer();
}

module.exports = { app, startHttpServer, startWsPriceRuntime };
