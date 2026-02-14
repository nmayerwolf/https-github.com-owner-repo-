# NexusFin Phase 3 Release Checklist

## 1. Pre-check local

Frontend web:

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm install
npm run check
npm run test:coverage
```

Backend API:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm install
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check
```

Mobile Expo (MVP):

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile
npm install
npm start
```

## 2. Required env vars

Frontend web (`/Users/nmayerwolf/Documents/nexusfin/.env`):

```bash
VITE_API_URL=https://<backend-domain>/api
VITE_ANTHROPIC_KEY=
```

Backend (`/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/.env`):

```bash
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/nexusfin
JWT_SECRET=<secret-64-chars-min>
CSRF_SECRET=<csrf-secret>
FINNHUB_KEY=<key>
ALPHA_VANTAGE_KEY=<key>
FRONTEND_URL=https://<frontend-domain>
NODE_ENV=production
COOKIE_DOMAIN=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://<backend-domain>/api/auth/google/callback
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=
APPLE_CALLBACK_URL=https://<backend-domain>/api/auth/apple/callback

CRON_ENABLED=true
CRON_MARKET_INTERVAL=5
CRON_CRYPTO_INTERVAL=15
CRON_FOREX_INTERVAL=15
CRON_COMMODITY_INTERVAL=60
WS_PRICE_INTERVAL=20

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@nexusfin.app
EXPO_ACCESS_TOKEN=
```

Mobile Expo (`/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/.env`):

```bash
EXPO_PUBLIC_API_URL=https://<backend-domain>/api
```

## 3. Backend release

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm run migrate
npm run start
```

Verificar migraciones incluidas:
- `001_initial.sql`
- `002_phase3_foundation.sql`
- `003_push_subscription_dedupe.sql`

## 4. Frontend web release

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm run build
```

## 5. Mobile release prep

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile
npm start
```

Validar en dispositivo físico:
- Login email/password mobile.
- Alertas con fetch inicial + refresh manual.
- Alertas en vivo por `WS /ws`.
- Activar push nativo (Expo token registrado en backend).
- Desactivar push nativo.
- Logout limpia suscripciones mobile activas.

## 6. Smoke tests (manual)

API health:
- `GET /api/health` -> `{ "ok": true }`
- `GET /api/health/realtime` autenticado -> métricas runtime WS.

Auth:
- Register/login/logout.
- OAuth Google callback.
- OAuth Apple callback completo.
- `GET /api/auth/me` y `PATCH /api/auth/me` (onboarding).

Core:
- Dashboard/Markets con datos reales.
- Portfolio CRUD.
- Config persistente.
- Watchlist add/remove.
- Groups (crear/unirse/renombrar/eliminar/miembros/feed/reacciones).

Alerts/Export:
- Historial/performance de alertas.
- Compartir alerta a grupo.
- `GET /api/export/alert/:id?format=pdf`.
- `GET /api/export/portfolio?format=csv`.

Realtime:
- Web autenticada recibe `price` + `alert` por WS.
- Cobertura de activos realtime: stocks/ETF, crypto, forex, metales, commodities, bonos.

Notifications:
- Web push (VAPID) funcional.
- Mobile Expo push funcional (ios/android).
- Preferencias (`stopLoss`, `opportunities`, `groupActivity`, quiet hours) aplican.

## 7. PR / merge gate

- PR base: `main`.
- CI green (Node 20.x/22.x + build).
- Confirmar no quedan migraciones sin ejecutar en entorno target.
- Merge squash o merge commit según política del repo.
