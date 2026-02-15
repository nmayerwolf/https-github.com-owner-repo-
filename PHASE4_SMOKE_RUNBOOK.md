# Phase 4 Smoke Runbook

Fecha: 2026-02-15
Branch objetivo: `feat/websocket-hub`

## 1) Gate automático previo

Script recomendado:

```bash
cd /Users/nmayerwolf/Documents/nexusfin
./scripts/phase4_gate.sh
```

Manual:

Web:

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm run check
npm run test:e2e
```

API:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run test:coverage
```

## 2) Health backend

```bash
curl -s http://localhost:3001/api/health | jq
curl -s http://localhost:3001/api/health/mobile | jq
curl -s http://localhost:3001/api/health/phase3 | jq
curl -s http://localhost:3001/api/health/cron | jq
```

Esperado:
- `health.ok = true`
- `health/mobile.ok = true`
- `health/cron.enabled = true`

## 3) Smoke funcional web

- Login email/password.
- Navegar dashboard -> portfolio.
- Crear posición y validar que aparece.
- Markets realtime con suscripción WS.
- Alerts en vivo/historial/performance.
- Theme toggle persistente.
- Logout y re-login.

## 4) Smoke funcional API

- Auth cookie + CSRF:
  - `GET /api/auth/csrf`
  - mutaciones con `X-CSRF-Token`.
- Password reset:
  - `POST /api/auth/forgot-password`
  - `POST /api/auth/reset-password`.
- Export:
  - `GET /api/export/portfolio?format=csv`
  - `GET /api/export/alert/:id?format=pdf`.
- Realtime:
  - WS `/ws` con auth válida.
  - subscribe/unsubscribe símbolos.

## 5) Smoke funcional mobile

- Login.
- Onboarding 4 pasos.
- Push mobile (subscribe + test push + unsubscribe).
- Markets multi-activo.
- Watchlist add/remove.
- Alerts tabs y share a grupos.
- Theme persistente.

## 6) App Store readiness

Config:
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/app.json`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/eas.json`
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/APP_STORE_METADATA.md`

Build:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile
npx eas build --platform ios --profile production
npx eas build --platform android --profile production
```

Submit:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile
npx eas submit --platform ios --profile production
npx eas submit --platform android --profile production
```

Alternativa automatizada con logging:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile
npm run release:store:dry
npm run release:store
```

## 7) Merge gate final

- CI verde en PR.
- Sin conflictos con `main`.
- Revisar `/Users/nmayerwolf/Documents/nexusfin/PHASE4_CLOSEOUT.md`.
