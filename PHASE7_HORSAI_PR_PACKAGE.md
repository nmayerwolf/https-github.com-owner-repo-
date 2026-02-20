# PHASE 7 PR PACKAGE (HORSAI Agent)

## PR Title
`feat(horsai): add risk-adjusted HORSAI daily engine, signals, outcomes and API contract`

## PR Summary
Este PR implementa la capa HORSAI end-to-end en backend:
- motor diario batch para scores/sugerencias por portfolio,
- política de escalación y cooldowns,
- persistencia de señales/outcomes/conviction,
- endpoints API para UX de Portfolio + Signal Review,
- soporte en admin jobs y smoke productivo.

## What Changed
- Nueva migración:
  - `nexusfin-api/migrations/018_horsai_agent_core.sql`
  - crea tablas:
    - `horsai_portfolio_scores_daily`
    - `horsai_signals`
    - `horsai_signal_outcomes`
    - `horsai_user_conviction_policy`
- Servicios nuevos:
  - `nexusfin-api/src/services/horsaiPolicy.js`
    - pesos dinámicos `alpha/beta/gamma`
    - RAI
    - escalación L1/L2/L3
    - control de elegibilidad para activos específicos
    - cooldown/reactivación
  - `nexusfin-api/src/services/horsaiEngine.js`
    - upsert score diario
    - crear señal
    - acción usuario (`acknowledge|dismiss`) con cooldown
    - outcomes + agregados de signal review
    - actualización de threshold de convicción por `RAI_mean_20`
  - `nexusfin-api/src/services/horsaiDaily.js`
    - ejecución global diaria por portfolios
    - aplica score, threshold de confianza y reglas de persistencia/cooldown
- Rutas nuevas:
  - `nexusfin-api/src/routes/horsai.js`
  - endpoints:
    - `GET /api/horsai/portfolio/:id/summary`
    - `GET /api/horsai/portfolio/:id/signal-review?days=90`
    - `POST /api/horsai/signals/:id/action`
- Integración app:
  - `nexusfin-api/src/index.js`
    - mount de `/api/horsai`
    - integra `horsaiDaily.runGlobalDaily()` dentro de `portfolioDaily`
- Operación/admin:
  - `nexusfin-api/src/routes/adminJobs.js`
    - soporta job `horsai_daily` en `POST /api/admin/jobs/run`
- Contratos/docs:
  - `nexusfin-api/src/constants/contracts.js`
  - `nexusfin-api/README.md`
  - `scripts/mvp_prod_smoke.sh` (incluye checks HORSAI)

## Migrations to Run
- `018_horsai_agent_core.sql`

Comando:
```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm run migrate
```

## Validation Executed
- `npm test -- tests/horsaiPolicy.service.test.js tests/horsai.routes.test.js tests/horsaiDaily.service.test.js`
- `npm test -- tests/adminJobs.routes.test.js tests/horsaiPolicy.service.test.js tests/horsai.routes.test.js tests/horsaiDaily.service.test.js`
- Resultado: `23/23` tests passing.
- Migraciones ejecutadas localmente incluyendo `018_horsai_agent_core.sql`.

## Smoke (Staging/Prod)
```bash
cd /Users/nmayerwolf/Documents/nexusfin
JWT_TOKEN=<bearer> ADMIN_JOB_TOKEN=<admin-token> ./scripts/mvp_prod_smoke.sh https://api.horsai.app
```

Checks relevantes nuevos:
- `GET /api/portfolios`
- `GET /api/horsai/portfolio/:id/summary` (si existe portfolio)
- `GET /api/horsai/portfolio/:id/signal-review?days=90` (si existe portfolio)
- `POST /api/admin/jobs/run` con `jobs=["news_ingest_daily","horsai_daily"]`

## Rollback Plan
1. Revertir deploy de app.
2. Mantener tablas HORSAI sin uso (rollback no destructivo).
3. Desactivar job manual `horsai_daily` desde `admin/jobs/run`.
4. Si se requiere, hotfix para no montar `/api/horsai` temporalmente.

## Merge Checklist
1. Merge branch actual a `main`.
2. Deploy backend.
3. Ejecutar `npm run migrate` en entorno destino.
4. Correr smoke script completo con token admin.
5. Confirmar que `portfolioDaily` reporta salida de `horsai` en runtime/cron.
