# Release Bundle - MVP Strict (2026-02-19)

## 1) Scope de release
- Mercado oculto en UI (web/mobile), código preservado por feature flag.
- Realtime desactivable por runtime flags (`REALTIME_ENABLED`) en backend/web/mobile.
- Contrato de error API unificado a shape anidado.
- Límites/ACL de portfolio alineados al spec v1.1.
- Tests mínimos del spec implementados y pasando.
- Documentación/spec/checklists actualizados para ejecución.

## 2) Orden recomendado de commits

### Commit A - Product flags y UX (Mercado + realtime gating UI)
Archivos:
- `/Users/nmayerwolf/Documents/nexusfin/src/App.jsx`
- `/Users/nmayerwolf/Documents/nexusfin/src/components/Navigation.jsx`
- `/Users/nmayerwolf/Documents/nexusfin/src/store/AppContext.jsx`
- `/Users/nmayerwolf/Documents/nexusfin/src/config/features.js`
- `/Users/nmayerwolf/Documents/nexusfin/tests/e2e/auth-portfolio-flow.spec.js`
- `/Users/nmayerwolf/Documents/nexusfin/playwright.config.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/App.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/src/config/features.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/src/screens/AlertsScreen.js`

### Commit B - Backend contract + business rules
Archivos:
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/config/env.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/index.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/middleware/errorHandler.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/routes/portfolio.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/routes/watchlist.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/routes/alerts.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/routes/groups.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/routes/migrate.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/services/regime.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/services/profileFocus.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/services/portfolioAdvisor.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/migrations/011_phase6_portfolio_collaborator_roles.sql`

### Commit C - Tests API/Web
Archivos:
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/marketDataProvider.service.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/regime.service.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/profileFocus.service.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/portfolio.routes.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/portfolioAdvisor.service.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/watchlist.routes.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/alerts.routes.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/auth.middleware.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/auth.routes.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/config.routes.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/export.routes.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/groups.routes.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/market.routes.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/migrate.routes.test.js`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/notifications.routes.test.js`

### Commit D - Docs y templates de operación
Archivos:
- `/Users/nmayerwolf/Documents/nexusfin/SPEC_MVP_V1_1_LOCKED.md`
- `/Users/nmayerwolf/Documents/nexusfin/MVP_SQL_MIGRATION_CHECKLIST_v1_1.md`
- `/Users/nmayerwolf/Documents/nexusfin/MVP_AUTOMATED_TEST_MATRIX_v1_1.md`
- `/Users/nmayerwolf/Documents/nexusfin/MVP_EXECUTION_CHECKLIST_AND_TEST_MATRIX.md`
- `/Users/nmayerwolf/Documents/nexusfin/README.md`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/README.md`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/README.md`
- `/Users/nmayerwolf/Documents/nexusfin/DEPLOY_PRODUCTION_RUNBOOK.md`
- `/Users/nmayerwolf/Documents/nexusfin/scripts/deploy_preflight.sh`
- `/Users/nmayerwolf/Documents/nexusfin/.env.example`
- `/Users/nmayerwolf/Documents/nexusfin/.env.production.example`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/.env.example`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/.env.production.example`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/.env.example`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/.env.production.example`
- `/Users/nmayerwolf/Documents/nexusfin/.github/workflows/ci.yml`

## 3) Validaciones ejecutadas
- API: `npm test` en `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api` -> 27/27 suites OK.
- Web: `npm test` en `/Users/nmayerwolf/Documents/nexusfin` -> 20/20 suites OK.
- E2E target: `npm run test:e2e -- tests/e2e/auth-portfolio-flow.spec.js` -> OK.

## 4) Notas de higiene antes de commit
- Excluir del commit:
  - `/Users/nmayerwolf/Documents/nexusfin/CLAUDE_MARKET_CODE_DUMP.txt`
  - `/Users/nmayerwolf/Documents/nexusfin/CLAUDE_MARKET_REBUILD_CONTEXT.md`
- Revisar que no haya `.env` reales en stage.

## 5) Orden de deploy (production-only)
1. Deploy backend (Railway) con base `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/.env.production.example`.
2. Ejecutar migraciones (`npm run start:prod` ya las corre).
3. Verificar `GET /api/health` y `GET /api/health/cron`.
4. Deploy frontend (Vercel) con base `/Users/nmayerwolf/Documents/nexusfin/.env.production.example`.
5. Smoke manual según `/Users/nmayerwolf/Documents/nexusfin/DEPLOY_PRODUCTION_RUNBOOK.md`.
