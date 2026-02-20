# NexusFin API (MVP)

Backend de NexusFin para auth (Google/Gmail only), digest/recommendations batch, portfolios compartidos, jobs diarios y notificaciones.

## Setup local

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
cp .env.example .env
npm install
npm run migrate
npm run dev
```

## Deploy (Railway)

- Config file: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/railway.toml`
- Start command de producción: `npm run start:prod` (corre migraciones + API).

## Env vars principales

```bash
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/nexusfin
JWT_SECRET=<secret-largo>
CSRF_SECRET=<secret-csrf>
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
COOKIE_DOMAIN=

FINNHUB_KEY=
ALPHA_VANTAGE_KEY=
TWELVE_DATA_KEY=

CRON_ENABLED=false
CRON_MARKET_INTERVAL=5
CRON_CRYPTO_INTERVAL=15
CRON_FOREX_INTERVAL=15
CRON_COMMODITY_INTERVAL=60
WS_PRICE_INTERVAL=20
REALTIME_ENABLED=false
MARKET_STRICT_REALTIME=true

AI_AGENT_ENABLED=false
ANTHROPIC_API_KEY=
AI_AGENT_MODEL=claude-haiku-4-5-20251001
AI_AGENT_MAX_ALERTS_PER_USER_PER_DAY=10
AI_AGENT_COOLDOWN_HOURS=4
AI_AGENT_REJECTION_COOLDOWN_HOURS=24
AI_AGENT_TIMEOUT_MS=10000
AI_NARRATIVE_ENABLED=false
AI_NARRATIVE_MODEL=claude-haiku-4-5-20251001
AI_NARRATIVE_TIMEOUT_MS=9000

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=

ADMIN_JOB_TOKEN=
ADMIN_JOB_TOKEN_NEXT=
ADMIN_JOBS_RATE_LIMIT_WINDOW_MS=60000
ADMIN_JOBS_RATE_LIMIT_MAX=10

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@nexusfin.app
EXPO_ACCESS_TOKEN=
```

Template prod:
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/.env.production.example`

## Endpoints clave

Auth:
- `GET /api/auth/oauth/providers` (incluye `gmailOnly=true`)
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/csrf`
- `GET /api/auth/me`
- `PATCH /api/auth/me`

MVP contract:
- `GET|PUT /api/agent/profile`
- `GET /api/news/digest/today`
- `GET /api/news/digest/:date`
- `GET /api/reco/today`
- `GET /api/reco/:date`
- `GET /api/crisis/today`
- `GET|POST|PUT /api/portfolios*` (incluye invite/accept y holdings)
- `GET /api/horsai/portfolio/:id/summary`
- `GET /api/horsai/portfolio/:id/signal-review?days=90`
- `POST /api/horsai/signals/:id/action` (`acknowledge|dismiss`)

Market:
- `GET /api/market/quote`
- `GET /api/market/candles`
- `GET /api/market/crypto-candles`
- `GET /api/market/forex-candles`
- `GET /api/market/commodity`
- `GET /api/market/profile`
- `GET /api/market/news`
- `GET /api/market/universe`

Portfolio/config/watchlist:
- `GET|POST|PATCH|DELETE /api/portfolio`
- `GET|PUT /api/config`
- `GET|POST|DELETE /api/watchlist`

Groups/alerts/notifications/export:
- `GET|POST|PATCH|DELETE /api/groups/*`
- `GET /api/alerts`
- `POST /api/alerts/:id/share`
- `GET|PUT|POST|DELETE /api/notifications/*`
- `GET /api/export/portfolio?format=csv&filter=all|active|sold`
- `GET|POST /api/export/alert/:id?format=pdf`

Health/realtime:
- `GET /api/health`
- `GET /api/health/realtime`
- `GET /api/health/mobile`
- `GET /api/health/phase3`
- `GET /api/health/cron`
- `WS /ws`

Admin jobs:
- `POST /api/admin/jobs/run`
- `GET /api/admin/jobs/runs`
- `GET /api/admin/jobs/status`

Admin jobs soportados (`jobs`):
- `mvp_daily`
- `portfolio_snapshots`
- `notification_policy`
- `market_snapshot_daily`
- `fundamentals_weekly`
- `news_ingest_daily`
- `macro_radar`
- `portfolio_advisor`
- `horsai_daily`

## API Error Contract (v1.1)

Todos los errores de API deben responder con shape anidado:

```json
{
  "error": {
    "code": "HOLDING_LIMIT_REACHED",
    "message": "Max holdings per portfolio is 15",
    "details": { "limit": 15, "attempted": 16 }
  }
}
```

Status codes estandarizados:
- `400 BAD_REQUEST` (payload inválido / enum inválido)
- `401 UNAUTHORIZED` (sin auth o sesión inválida)
- `403 FORBIDDEN` (ACL)
- `404 NOT_FOUND`
- `409 CONFLICT` (duplicado lógico)
- `422 UNPROCESSABLE_ENTITY` (límite de negocio / validación semántica)
- `429 TOO_MANY_REQUESTS`
- `500 INTERNAL_ERROR`
- `503 SERVICE_UNAVAILABLE`

Códigos mínimos usados en MVP:
- `PORTFOLIO_LIMIT_REACHED`
- `HOLDING_LIMIT_REACHED`
- `FORBIDDEN_PORTFOLIO_ACTION`
- `INVALID_ENUM`
- `DUPLICATE_HOLDING`
- `INVITE_NOT_FOUND`
- `INVITE_ALREADY_ACCEPTED`

## Seguridad/operación

- CSRF obligatorio para mutaciones web en modo cookie.
- Market rate limit por usuario autenticado.
- Sanitización de texto libre en rutas de portfolio/grupos.
- Escaneo de fugas de keys en bundle frontend se ejecuta en CI (repo root).
- Realtime runtime controlado por `REALTIME_ENABLED`:
  - `false` = MVP strict (sin WS runtime/streaming)
  - `true` = realtime habilitado

## Migraciones

- `001_initial.sql`
- `002_phase3_foundation.sql`
- `003_push_subscription_dedupe.sql`
- `004_phase4_cron_runs.sql`
- `005_phase4_ai_agent.sql`
- `006_phase4_password_reset_tokens.sql`
- `007_phase4_ai_agent_v2.sql`
- `008_phase5_multi_portfolio.sql`
- `009_phase5_remove_legacy_default_portfolio.sql`
- `010_phase5_portfolio_collaboration.sql`
- `011_phase5_news_telemetry.sql`
- `012_mvp_phase1_core.sql`
- `013_phase1_active_holding_unique.sql`
- `014_phase6_mvp_contract.sql`
- `015_phase6_notification_events.sql`
- `016_phase6_admin_job_runs_audit.sql`
- `017_mvp_universe_expand.sql`
- `018_horsai_agent_core.sql`

## Tests

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check
```
