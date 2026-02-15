# PHASE 4 PR PACKAGE

## Link

https://github.com/nmayerwolf/https-github.com-owner-repo-/pull/new/feat/websocket-hub

## Title

feat(phase4): finalize release readiness, e2e flow and closeout docs

## Description

Este PR consolida el cierre técnico de Fase 4 en web, api y mobile.

Incluye:
- hardening y cierre funcional de backend realtime/cron/outcomes.
- password reset por token y contratos de seguridad ya integrados.
- cobertura y estabilidad de CI (web, api coverage, e2e Playwright).
- flujo E2E realista `login -> dashboard -> portfolio -> alta de posición`.
- configuración de release mobile con EAS (app config, assets, metadata).
- automatización de release mobile (`release:preflight`, `release:store:dry`, `release:store`).
- documentación de cierre y auditoría:
  - `PHASE4_CLOSEOUT.md`
  - `PHASE4_SMOKE_RUNBOOK.md`
  - `PHASE4_RELEASE_CHECKLIST.md`
  - `PHASE4_AUDIT_BUNDLE.md`
  - `scripts/phase4_gate.sh`
  - `scripts/phase4_release_pack.sh`

Validaciones ejecutadas:
- `npm run check`
- `npm run test:e2e`
- `cd nexusfin-api && DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run test:coverage`
- `./scripts/phase4_gate.sh`
- `./scripts/phase4_release_pack.sh`
- `npm -C nexusfin-mobile run release:preflight`
- `npm -C nexusfin-mobile run release:store:dry`

Pendiente fuera del repo (operativo):
- `eas build` real iOS/Android con credenciales.
- `eas submit` real a TestFlight y Play Internal.
- smoke final en dispositivos reales.

## Commits (main..feat/websocket-hub)

- a3360b2 chore(phase4-mobile): add release preflight checks
- 943b996 chore(phase4-mobile): automate eas release flow with logs
- 54570d5 docs(phase4): add release checklist and audit bundle generator
- f943263 chore(phase4): add release gate script and smoke runbook
- b4bfc3c docs(phase4): add closeout report and release status
- d3c6911 feat(phase4-mobile): add eas production config and store metadata
- 35cad3c test(phase4): add e2e auth-portfolio flow and fix react runtime imports
- 838ef2a refactor(phase4): share config defaults and validation contracts
- b5196d2 refactor(phase4): share alert contracts across api and web
- a4654e6 fix(ci): keep npm pipeline stable while preserving monorepo scaffold
- fea6ffd refactor(phase4): scaffold monorepo workspaces with shared @nexusfin/core
- 3347591 feat(phase4): add route error boundaries and offline cache fallback
- 4a40fd7 test(phase4): add playwright smoke e2e and api coverage CI
- d06d3cf ci(phase4): add backend coverage job and artifact
- 9c9e806 docs(phase4): unify readme and add changelog for phases 1-4
- f47482d chore(ci): fail build if market keys leak into frontend bundle
- 56c613e fix(phase4): enforce per-user market rate-limit and sanitize text inputs
- 87435c5 test(phase4): raise AppContext and confluence branch coverage
- ee9a630 feat(phase4): add token-based password reset flow
- aedda9b feat(phase4): add ai-agent validation with cron anti-spam controls
- b5449b3 feat(phase4): add server-side outcome evaluation cycle
- 9fba9ba feat(phase4): implement cron runtime status and health endpoint
- 878d6a5 feat(phase4): route frontend market data through backend proxies
