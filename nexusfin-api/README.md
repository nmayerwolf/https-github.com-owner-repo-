# NexusFin API (Phase 2/3 Foundation)

Backend de NexusFin para auth, persistencia multi-usuario, proxy seguro de market data y base de Fase 3.

## Setup local

1. Copiar `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/.env.example` a `.env`
2. Completar variables requeridas
3. Instalar dependencias, migrar y correr:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm install
npm run migrate
npm run dev
```

## Variables de entorno

```bash
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/nexusfin
JWT_SECRET=<secret-largo>
CSRF_SECRET=<secret-csrf>
COOKIE_DOMAIN=
FINNHUB_KEY=<key>
ALPHA_VANTAGE_KEY=<key>
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
APPLE_CALLBACK_URL=http://localhost:3001/api/auth/apple/callback

CRON_ENABLED=false
VAPID_PUBLIC_KEY=<vapid-public>
VAPID_PRIVATE_KEY=<vapid-private>
VAPID_SUBJECT=mailto:admin@nexusfin.app
CRON_MARKET_INTERVAL=5
CRON_CRYPTO_INTERVAL=15
CRON_FOREX_INTERVAL=15
CRON_COMMODITY_INTERVAL=60
WS_PRICE_INTERVAL=20
```

## Endpoints principales

Auth:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout` (autenticado)
- `POST /api/auth/reset-password` (autenticado)
- `GET /api/auth/csrf` (autenticado)
- `GET /api/auth/me` (autenticado)
- `PATCH /api/auth/me` (autenticado)
- `GET /api/auth/oauth/providers`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/apple`
- `GET /api/auth/apple/callback`

Datos de usuario:
- `GET|POST|PATCH|DELETE /api/portfolio`
- `GET|PUT /api/config`
- `GET|POST|DELETE /api/watchlist`

Market proxy:
- `GET /api/market/quote`
- `GET /api/market/candles`
- `GET /api/market/crypto-candles`
- `GET /api/market/forex-candles`
- `GET /api/market/commodity`
- `GET /api/market/profile`

Groups:
- `POST /api/groups`
- `POST /api/groups/join`
- `GET /api/groups`
- `GET /api/groups/:id`
- `PATCH /api/groups/:id`
- `DELETE /api/groups/:id`
- `DELETE /api/groups/:id/members/:userId`
- `DELETE /api/groups/:id/leave`
- `GET /api/groups/:id/feed`
- `POST /api/groups/:groupId/feed/:eventId/react`

Alerts (Fase 3 foundation):
- `GET /api/alerts`
- `GET /api/alerts/:id`
- `POST /api/alerts/:id/share`

Notifications (Fase 3 foundation):
- `GET /api/notifications/vapid-public-key`
- `POST /api/notifications/subscribe`
- `GET /api/notifications/preferences`
- `PUT /api/notifications/preferences`
- `DELETE /api/notifications/subscribe/:id`

Export:
- `GET /api/export/portfolio?format=csv&filter=all|active|sold`
- `GET /api/export/alert/:id?format=pdf`

Migration:
- `POST /api/migrate`

Health:
- `GET /api/health`

Realtime scaffold (Fase 3):
- `WS /ws` (auth vía cookie `nxf_token` o query `?token=<jwt>`)
- price relay backend por símbolos suscriptos (`type: "price"`) usando `WS_PRICE_INTERVAL`
  - Finnhub: `AAPL`, `BINANCE:BTCUSDT`, `OANDA:EUR_USD`
  - Alpha Vantage macro: `AV:GOLD`, `AV:SILVER`, `AV:WTI`, `AV:TREASURY_YIELD:10YEAR`
  - relay con backoff ante errores y heartbeat para evitar ruido cuando el precio no cambia
- cron worker configurable por `CRON_*` vars
- alert engine server-side: calcula indicadores + confluencia y persiste alerts sin duplicados (<4h)

## Reglas importantes

- Todas las rutas excepto `/api/health` y `/api/auth/*` requieren auth (Bearer o cookie `nxf_token`).
- En modo web con cookie, mutaciones requieren header `X-CSRF-Token` obtenido desde `GET /api/auth/csrf`.
- Google OAuth está funcional vía callback HTTP.
- Apple OAuth funcional: inicia flujo, valida state, hace exchange de código y crea/vincula sesión.
- API keys viven solo en backend.
- Lockout de login devuelve `429` con body `retryAfter` y header `Retry-After`.
- Migración localStorage se bloquea con `409 ALREADY_MIGRATED` si el usuario ya tiene datos.
- `POST /api/auth/reset-password` invalida otras sesiones activas del usuario.

## Migraciones

- `001_initial.sql`: base de Fase 2.
- `002_phase3_foundation.sql`: tablas base de Fase 3 (alerts, notifications, social feed, shared alerts, campos OAuth).

## Tests

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check
```
