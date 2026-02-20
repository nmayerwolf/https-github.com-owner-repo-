# PHASE 6 CLOSEOUT (MVP)

Fecha: 2026-02-20  
Branch: `codex/phase3-next`

## 1) Estado
- MVP backend implementado y validado.
- Auth productivo: Google OAuth + restricción Gmail-only.
- Jobs batch diarios/semanales operativos con tracking en `job_runs`.
- Contratos API de digest/reco/portfolio/crisis alineados al spec locked.
- Runbooks y smoke productivo actualizados.

## 2) Cambios cerrados en esta fase
- Capa narrativa segura (`LLM narrative-only`) para digest/reco con fallback determinístico.
- Enforcement auth:
  - `POST /api/auth/register` -> `403 GOOGLE_OAUTH_ONLY`
  - `POST /api/auth/login` -> `403 GOOGLE_OAUTH_ONLY`
  - reset password flows -> `403 GOOGLE_OAUTH_ONLY`
  - Google callback restringido a `@gmail.com` / `@googlemail.com`.
- Portfolios:
  - errores contractuales (`DUPLICATE_HOLDING`, `INVITE_NOT_FOUND`, `INVITE_ALREADY_ACCEPTED`, etc.).
  - límites con `error.details` (`limit`, `attempted`).
- Reco/digest hardening:
  - digest siempre contiene `Regime Today`, `Leadership/themes`, `Key risks`.
  - reco con límites de riesgos y `opportunisticType` solo en opportunistic.
- Crisis deterministic strict:
  - `spy_vol_20d_z` thresholds.
  - `shock_event_flag` por whitelist de tags de alto impacto.
- Universo:
  - migración `017_mvp_universe_expand.sql` para ampliar símbolo curado.
- Operación:
  - `GET /api/admin/jobs/runs`
  - `GET /api/admin/jobs/status`
  - script `scripts/mvp_prod_smoke.sh`

## 3) Migraciones requeridas en prod
- `012_mvp_phase1_core.sql`
- `013_phase1_active_holding_unique.sql`
- `014_phase6_mvp_contract.sql`
- `015_phase6_notification_events.sql`
- `016_phase6_admin_job_runs_audit.sql`
- `017_mvp_universe_expand.sql`

Comando:
```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm run migrate
```

## 4) Variables críticas de producción
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL=https://api.horsai.app/api/auth/google/callback`
- `ADMIN_JOB_TOKEN`
- `ADMIN_JOB_TOKEN_NEXT` (opcional)
- `AI_NARRATIVE_ENABLED=true`
- `ANTHROPIC_API_KEY`
- `CRON_ENABLED=true`
- `REALTIME_ENABLED=false`

## 5) Smoke final recomendado
```bash
cd /Users/nmayerwolf/Documents/nexusfin
JWT_TOKEN=<bearer> ADMIN_JOB_TOKEN=<admin-token> ./scripts/mvp_prod_smoke.sh https://api.horsai.app
```

Checks mínimos:
- `GET /api/health` -> 200
- `GET /api/health/cron` -> 200
- `GET /api/news/digest/today` -> 200
- `GET /api/reco/today` -> 200
- `GET /api/crisis/today` -> 200
- `GET /api/admin/jobs/runs` -> 200
- `GET /api/admin/jobs/status` -> 200

## 6) Criterio de cierre
- Merge de `codex/phase3-next` a `main`.
- Migraciones aplicadas en prod.
- Smoke productivo completo sin fallas.
- Jobs diarios corriendo con registros en `admin_job_runs` y `job_runs`.
