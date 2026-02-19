# NexusFin API (Phase 4)

Backend de NexusFin para auth, portfolio/config/watchlist, market proxy, realtime WS, cron/AI agent y notificaciones push.

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
MARKET_STRICT_REALTIME=true

AI_AGENT_ENABLED=false
ANTHROPIC_API_KEY=
AI_AGENT_MODEL=claude-haiku-4-5-20251001
AI_AGENT_MAX_ALERTS_PER_USER_PER_DAY=10
AI_AGENT_COOLDOWN_HOURS=4
AI_AGENT_REJECTION_COOLDOWN_HOURS=24
AI_AGENT_TIMEOUT_MS=10000

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@nexusfin.app
EXPO_ACCESS_TOKEN=
```

## Endpoints clave

Auth:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password` (por token)
- `POST /api/auth/reset-password/authenticated`
- `GET /api/auth/csrf`
- `GET /api/auth/me`
- `PATCH /api/auth/me`

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

## Seguridad/operación

- CSRF obligatorio para mutaciones web en modo cookie.
- Market rate limit por usuario autenticado.
- Sanitización de texto libre en rutas de portfolio/grupos.
- Escaneo de fugas de keys en bundle frontend se ejecuta en CI (repo root).

## Migraciones

- `001_initial.sql`
- `002_phase3_foundation.sql`
- `003_push_subscription_dedupe.sql`
- `004_phase4_cron_runs.sql`
- `005_phase4_ai_agent.sql`
- `006_phase4_password_reset_tokens.sql`

## Tests

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check
```
