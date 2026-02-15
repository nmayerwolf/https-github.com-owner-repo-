# NexusFin (Phase 4)

NexusFin es una plataforma de monitoreo financiero multi-activo con:
- web (React + Vite),
- backend API (Node + Express + PostgreSQL),
- mobile (Expo),
- realtime por WebSocket, alertas, portfolio, grupos y notificaciones push.

## Arquitectura

- Web: `/Users/nmayerwolf/Documents/nexusfin`
- API: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api`
- Mobile: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile`

## Quickstart (10 min)

1. API

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
cp .env.example .env
npm install
npm run migrate
npm run dev
```

2. Web

```bash
cd /Users/nmayerwolf/Documents/nexusfin
cp .env.example .env
npm install
npm run dev
```

3. Mobile (opcional)

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile
npm install
npm run start
```

## Variables de entorno (web)

Archivo: `/Users/nmayerwolf/Documents/nexusfin/.env`

```bash
VITE_API_URL=http://localhost:3001/api
VITE_ANTHROPIC_KEY=
```

## Calidad y checks

Web:

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm run check
```

Incluye:
- tests frontend,
- build,
- escaneo de secretos en bundle (`check:bundle-secrets`).

API:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check
```

## Estado actual (resumen)

- Realtime multi-activo por backend (`/api/market/universe`, WS `/ws`).
- Cron server-side con health (`GET /api/health/cron`).
- AI agent de validación (fallback técnico cuando AI no está disponible).
- Outcome evaluation server-side (win/loss/open).
- Export:
  - CSV portfolio (`GET /api/export/portfolio?format=csv`)
  - PDF de alerta (`GET|POST /api/export/alert/:id?format=pdf`)
- Auth:
  - login/register/refresh/logout,
  - reset autenticado (`POST /api/auth/reset-password/authenticated`),
  - forgot/reset por token (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`).
- Push:
  - web (VAPID + service worker),
  - mobile (Expo).

## CI

Workflow: `/Users/nmayerwolf/Documents/nexusfin/.github/workflows/ci.yml`

- test matrix Node 20/22,
- build web,
- escaneo de secretos en `dist/`.

## Documentación de cierre

- `/Users/nmayerwolf/Documents/nexusfin/PHASE3_CLOSEOUT.md`
- `/Users/nmayerwolf/Documents/nexusfin/PHASE3_SMOKE_RUNBOOK.md`
- `/Users/nmayerwolf/Documents/nexusfin/PHASE3_RELEASE_CHECKLIST.md`
- `/Users/nmayerwolf/Documents/nexusfin/PHASE4_CLOSEOUT.md`
- `/Users/nmayerwolf/Documents/nexusfin/PHASE4_SMOKE_RUNBOOK.md`
- `/Users/nmayerwolf/Documents/nexusfin/PHASE4_RELEASE_CHECKLIST.md`
- `/Users/nmayerwolf/Documents/nexusfin/CHANGELOG.md`
