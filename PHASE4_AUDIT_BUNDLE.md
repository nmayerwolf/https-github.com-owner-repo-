# PHASE 4 AUDIT BUNDLE

## 1. PR LIST
- #107 | codex/release-notes-v1 | docs(release): add v1.0.0 github release notes | merged
- #106 | feat/websocket-hub | docs(phase4): add pr package with link title and description | merged
- #105 | feat/websocket-hub | feat(phase4): finalize release readiness, e2e flow and closeout docs | merged
- #104 | feat/websocket-hub | chore(phase4): add release gate script and smoke runbook | merged
- #103 | feat/websocket-hub | docs(phase4): add release checklist and audit bundle generator | merged
- #102 | feat/websocket-hub | feat(phase4-mobile): add eas production config and store metadata | merged
- #101 | feat/websocket-hub | test(phase4): add e2e auth-portfolio flow and fix react runtime imports | merged
- #100 | feat/websocket-hub | chore(phase4-mobile): automate eas release flow with logs | merged
- #99  | feat/websocket-hub | chore(phase4-mobile): add release preflight checks | merged
- #98  | feat/websocket-hub | docs(phase4): unify readme and add changelog for phases 1-4 | merged
- #97  | feat/websocket-hub | ci(phase4): add backend coverage job and artifact | merged
- #96  | feat/websocket-hub | test(phase4): add playwright smoke e2e and api coverage CI | merged
- #95  | feat/websocket-hub | feat(phase4): add route error boundaries and offline cache fallback | merged
- #94  | feat/websocket-hub | refactor(phase4): scaffold monorepo workspaces with shared @nexusfin/core | merged
- #93  | feat/websocket-hub | fix(ci): keep npm pipeline stable while preserving monorepo scaffold | merged
- #92  | feat/websocket-hub | refactor(phase4): share alert contracts across api and web | merged
- #91  | feat/websocket-hub | refactor(phase4): share config defaults and validation contracts | merged
- #90  | feat/websocket-hub | feat(phase4): add ai-agent validation with cron anti-spam controls | merged
- #89  | feat/websocket-hub | feat(phase4): add token-based password reset flow | merged
- #88  | feat/websocket-hub | test(phase4): raise AppContext and confluence branch coverage | merged
- #87  | feat/websocket-hub | fix(phase4): enforce per-user market rate-limit and sanitize text inputs | merged
- #86  | feat/websocket-hub | chore(ci): fail build if market keys leak into frontend bundle | merged
- #85  | feat/websocket-hub | docs(phase4): unify readme and add changelog for phases 1-4 | merged

## 2. BACKEND FILE TREE
```
nexusfin-api/src/config/cache.js
nexusfin-api/src/config/db.js
nexusfin-api/src/config/env.js
nexusfin-api/src/constants/marketUniverse.js
nexusfin-api/src/engine/analysis.js
nexusfin-api/src/engine/confluence.js
nexusfin-api/src/index.js
nexusfin-api/src/middleware/auth.js
nexusfin-api/src/middleware/errorHandler.js
nexusfin-api/src/middleware/rateLimiter.js
nexusfin-api/src/realtime/wsHub.js
nexusfin-api/src/routes/alerts.js
nexusfin-api/src/routes/auth.js
nexusfin-api/src/routes/config.js
nexusfin-api/src/routes/export.js
nexusfin-api/src/routes/groups.js
nexusfin-api/src/routes/market.js
nexusfin-api/src/routes/migrate.js
nexusfin-api/src/routes/notifications.js
nexusfin-api/src/routes/portfolio.js
nexusfin-api/src/routes/watchlist.js
nexusfin-api/src/services/aiAgent.js
nexusfin-api/src/services/alertEngine.js
nexusfin-api/src/services/alphavantage.js
nexusfin-api/src/services/finnhub.js
nexusfin-api/src/services/groupCode.js
nexusfin-api/src/services/oauth.js
nexusfin-api/src/services/push.js
nexusfin-api/src/utils/errors.js
nexusfin-api/src/utils/validate.js
nexusfin-api/src/workers/marketCron.js
```

## 3. FRONTEND FILE TREE
```
src/App.jsx
src/api/__tests__/apiClient.test.js
src/api/alphavantage.js
src/api/apiClient.js
src/api/claude.js
src/api/finnhub.js
src/api/realtime.js
src/components/AIThesis.jsx
src/components/Alerts.jsx
src/components/AssetDetail.jsx
src/components/AuthScreen.jsx
src/components/Dashboard.jsx
src/components/Groups.jsx
src/components/Markets.jsx
src/components/Navigation.jsx
src/components/Portfolio.jsx
src/components/Screener.jsx
src/components/Settings.jsx
src/components/__tests__/Alerts.test.jsx
src/components/__tests__/App.errorBoundary.test.jsx
src/components/__tests__/App.offlineBanner.test.jsx
src/components/__tests__/App.onboarding.test.jsx
src/components/__tests__/Groups.test.jsx
src/components/__tests__/Portfolio.test.jsx
src/components/__tests__/Settings.test.jsx
src/components/common/CategoryBadge.jsx
src/components/common/ConfluenceBar.jsx
src/components/common/ErrorBoundary.jsx
src/components/common/LoadingScreen.jsx
src/components/common/SignalBadge.jsx
src/components/common/Sparkline.jsx
src/engine/__tests__/alerts.test.js
src/engine/__tests__/analysis.test.js
src/engine/__tests__/confluence.test.js
src/engine/alerts.js
src/engine/analysis.js
src/engine/confluence.js
src/lib/notifications.js
src/main.jsx
src/store/AppContext.jsx
src/store/AuthContext.jsx
src/store/ThemeContext.jsx
src/store/__tests__/appContext.auth.integration.test.jsx
src/store/__tests__/appContext.integration.test.jsx
src/store/__tests__/appContextReducer.test.js
src/store/__tests__/configStore.test.js
src/store/__tests__/portfolioStore.test.js
src/store/configStore.js
src/store/portfolioStore.js
src/store/watchlistStore.js
src/styles.css
src/utils/constants.js
src/utils/format.js
```

## 4. BACKEND DEPS
```
{
  "name": "nexusfin-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "nodemon src/index.js",
    "start": "node src/index.js",
    "migrate": "node migrations/run.js",
    "test": "jest --runInBand",
    "test:coverage": "jest --runInBand --coverage",
    "check": "npm test"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "express-rate-limit": "^7.4.1",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "node-cache": "^5.1.2",
    "node-cron": "^4.2.1",
    "pg": "^8.13.1",
    "uuid": "^11.0.3",
    "web-push": "^3.6.7",
    "ws": "^8.19.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nodemon": "^3.1.9",
    "supertest": "^7.0.0"
  }
}
```

## 5. FRONTEND DEPS
```
{
  "name": "nexusfin",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "check:bundle-secrets": "bash ./scripts/check_frontend_bundle_secrets.sh",
    "check": "npm test && npm run build && npm run check:bundle-secrets"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.30.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.58.2",
    "@testing-library/react": "^16.2.0",
    "@vitest/coverage-v8": "^2.1.8",
    "jsdom": "^25.0.1",
    "vite": "^5.4.14",
    "vitest": "^2.1.8"
  }
}
```

## 6. MIGRATIONS
```
total 56
drwxr-xr-x@  9 nmayerwolf  staff   288 Feb 15 16:42 .
drwxr-xr-x@ 11 nmayerwolf  staff   352 Feb 15 16:42 ..
-rw-r--r--@  1 nmayerwolf  staff  3478 Feb 13 14:01 001_initial.sql
-rw-r--r--@  1 nmayerwolf  staff  3491 Feb 15 16:42 002_phase3_foundation.sql
-rw-r--r--@  1 nmayerwolf  staff  1249 Feb 15 16:42 003_push_subscription_dedupe.sql
-rw-r--r--@  1 nmayerwolf  staff   355 Feb 15 16:42 004_phase4_cron_runs.sql
-rw-r--r--@  1 nmayerwolf  staff  1434 Feb 15 16:42 005_phase4_ai_agent.sql
-rw-r--r--@  1 nmayerwolf  staff   530 Feb 15 16:42 006_phase4_password_reset_tokens.sql
-rw-r--r--@  1 nmayerwolf  staff   664 Feb 15 16:42 run.js
```

## 7. ENV EXAMPLE
```
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/nexusfin
JWT_SECRET=cambiar-esto-por-algo-seguro-de-64-chars
CSRF_SECRET=cambiar-esto-por-un-secreto-csrf
FINNHUB_KEY=
ALPHA_VANTAGE_KEY=
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
COOKIE_DOMAIN=

# OAuth (Phase 3)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
APPLE_CALLBACK_URL=http://localhost:3001/api/auth/apple/callback

# Phase 3 scaffold toggles
CRON_ENABLED=false
CRON_MARKET_INTERVAL=5
CRON_CRYPTO_INTERVAL=15
CRON_FOREX_INTERVAL=15
CRON_COMMODITY_INTERVAL=60
AI_AGENT_ENABLED=false
ANTHROPIC_API_KEY=
AI_AGENT_MODEL=claude-haiku-4-5-20251001
AI_AGENT_MAX_ALERTS_PER_USER_PER_DAY=10
AI_AGENT_COOLDOWN_HOURS=4
AI_AGENT_REJECTION_COOLDOWN_HOURS=24
AI_AGENT_TIMEOUT_MS=10000
WS_PRICE_INTERVAL=20

# Web Push (Phase 3)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@nexusfin.app
EXPO_ACCESS_TOKEN=
```

## 8. TEST RESULTS BACKEND
```

> nexusfin-api@1.0.0 check
> npm test


> nexusfin-api@1.0.0 test
> jest --runInBand

node:events:486
      throw er; // Unhandled 'error' event
      ^

Error: listen EPERM: operation not permitted 0.0.0.0
    at Server.setupListenHandle [as _listen2] (node:net:1918:21)
    at listenInCluster (node:net:1997:12)
    at Server.listen (node:net:2102:7)
    at Test.serverAddress (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/supertest/lib/test.js:63:35)
    at new Test (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/supertest/lib/test.js:49:14)
    at Object.obj.<computed> [as get] (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/supertest/index.js:40:18)
    at Object.<anonymous> (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/health.routes.test.js:30:36)
    at Promise.then.completed (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-circus/build/utils.js:298:28)
    at new Promise (<anonymous>)
    at callAsyncCircusFn (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-circus/build/utils.js:231:10)
    at _callCircusTest (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-circus/build/run.js:316:40)
    at _runTest (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-circus/build/run.js:252:3)
    at _runTestsForDescribeBlock (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-circus/build/run.js:126:9)
    at _runTestsForDescribeBlock (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-circus/build/run.js:121:9)
    at run (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-circus/build/run.js:71:3)
    at runAndTransformResultsToJestFormat (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapterInit.js:122:21)
    at jestAdapter (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapter.js:79:19)
    at runTestInternal (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-runner/build/runTest.js:367:16)
    at runTest (/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/node_modules/jest-runner/build/runTest.js:444:34)
Emitted 'error' event on Server instance at:
    at emitErrorNT (node:net:1976:8)
    at processTicksAndRejections (node:internal/process/task_queues:89:21) {
  code: 'EPERM',
  errno: -1,
  syscall: 'listen',
  address: '0.0.0.0'
}

Node.js v24.13.1
```

## 9. TEST RESULTS FRONTEND
```
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

stderr | src/components/__tests__/App.onboarding.test.jsx > App onboarding flow > shows onboarding and completes profile setup
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

stderr | src/components/__tests__/App.errorBoundary.test.jsx > App route error boundaries > renders fallback when dashboard crashes
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

 ✓ src/components/__tests__/App.errorBoundary.test.jsx (1 test) 61ms
 ✓ src/components/__tests__/App.offlineBanner.test.jsx (3 tests) 64ms
 ✓ src/components/__tests__/App.onboarding.test.jsx (1 test) 92ms
 ✓ src/components/__tests__/Portfolio.test.jsx (2 tests) 132ms
 ✓ src/components/__tests__/Alerts.test.jsx (5 tests) 148ms
 ✓ src/api/__tests__/apiClient.test.js (9 tests) 4ms
 ✓ src/components/__tests__/Settings.test.jsx (6 tests) 291ms
 ✓ src/store/__tests__/appContext.auth.integration.test.jsx (3 tests) 282ms
 ✓ src/components/__tests__/Groups.test.jsx (11 tests) 349ms
 ✓ src/engine/__tests__/confluence.test.js (3 tests) 3ms
 ✓ src/store/__tests__/appContextReducer.test.js (6 tests) 5ms
 ✓ src/store/__tests__/configStore.test.js (4 tests) 6ms
 ✓ src/engine/__tests__/alerts.test.js (2 tests) 1ms
 ✓ src/engine/__tests__/analysis.test.js (2 tests) 1ms
 ✓ src/store/__tests__/portfolioStore.test.js (4 tests) 3ms
 ✓ src/store/__tests__/appContext.integration.test.jsx (6 tests) 508ms

 Test Files  16 passed (16)
      Tests  68 passed (68)
   Start at  16:44:47
   Duration  1.35s (transform 486ms, setup 0ms, collect 2.28s, tests 1.95s, environment 3.79s, prepare 744ms)


> nexusfin@1.0.0 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 66 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.72 kB │ gzip:  0.40 kB
dist/assets/index-BgJdKhXM.css    2.58 kB │ gzip:  1.05 kB
dist/assets/index-YiMIMBA3.js   266.13 kB │ gzip: 80.17 kB
✓ built in 373ms

> nexusfin@1.0.0 check:bundle-secrets
> bash ./scripts/check_frontend_bundle_secrets.sh

OK: no se detectaron secretos de mercado en dist/.
```

## 10. API KEY CHECK
```
<no matches>
```

## 11. WEBSOCKET CHECK
```
<no matches>
```

## 12. CRON CHECK
```
nexusfin-api/src/workers/marketCron.js:1:const cron = require('node-cron');
nexusfin-api/src/workers/marketCron.js:120:    const job = cron.schedule(
```

## 13. AI AGENT CHECK
```
nexusfin-api/src/config/env.js:49:  aiAgentEnabled: asBool(process.env.AI_AGENT_ENABLED, false),
nexusfin-api/src/config/env.js:50:  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
nexusfin-api/src/config/env.js:51:  aiAgentModel: process.env.AI_AGENT_MODEL || 'claude-haiku-4-5-20251001',
nexusfin-api/src/config/env.js:52:  aiAgentMaxAlertsPerUserPerDay: asPositiveInt(process.env.AI_AGENT_MAX_ALERTS_PER_USER_PER_DAY, 10),
nexusfin-api/src/config/env.js:53:  aiAgentCooldownHours: asPositiveInt(process.env.AI_AGENT_COOLDOWN_HOURS, 4),
nexusfin-api/src/config/env.js:54:  aiAgentRejectionCooldownHours: asPositiveInt(process.env.AI_AGENT_REJECTION_COOLDOWN_HOURS, 24),
nexusfin-api/src/config/env.js:55:  aiAgentTimeoutMs: asPositiveInt(process.env.AI_AGENT_TIMEOUT_MS, 10000),
nexusfin-api/src/index.js:16:const { createAiAgent } = require('./services/aiAgent');
nexusfin-api/src/index.js:327:  const aiAgent = createAiAgent();
nexusfin-api/src/index.js:329:  const alertEngine = createAlertEngine({ query, finnhub, wsHub, pushNotifier, aiAgent, logger: console });
nexusfin-api/src/index.js:333:      maxAlertsPerUserPerDay: env.aiAgentMaxAlertsPerUserPerDay,
nexusfin-api/src/index.js:334:      rejectionCooldownHours: env.aiAgentRejectionCooldownHours,
nexusfin-api/src/services/alertEngine.js:80:const createAlertEngine = ({ query, finnhub, wsHub, pushNotifier = null, aiAgent = null, logger = console }) => {
nexusfin-api/src/services/alertEngine.js:449:      if (aiAgent?.validateSignal) {
nexusfin-api/src/services/alertEngine.js:450:        const aiOut = await aiAgent.validateSignal({
```

## 14. CLOSEOUT SUMMARY
- Implementado: gate scripts, audit bundle, documentation (closeout, smoke, checklist), backend realtime/cron/ai-agent, password-reset/session hardening, release-ready mobile config and automation, E2E flows, CI coverage.
- Pendiente: subir builds reales con certificados de Apple/Google, validar en TestFlight/Play Internal y ejecutar smoke final en dispositivo físico; las credenciales quedan bajo responsabilidad del equipo que administra Apple.
- Decisiones: dejamos la validación Apple en manos del equipo (no compartimos credenciales), usamos `remote` version source en `eas.json` para auto-incrementar, y registramos los logs en `nexusfin-mobile/release-logs/` para auditoría.
