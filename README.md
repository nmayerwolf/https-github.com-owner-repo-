# NexusFin (Phase 2)

Plataforma de monitoreo financiero en tiempo real con análisis técnico, alertas, portfolio multi-usuario y grupos.

## Arquitectura

- Frontend: React + Vite + React Router (`/Users/nmayerwolf/Documents/nexusfin`)
- Backend: Node.js + Express + PostgreSQL (`/Users/nmayerwolf/Documents/nexusfin/nexusfin-api`)
- Mobile: Expo React Native (`/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile`)
- Market data proxy: Finnhub + Alpha Vantage (keys solo en backend)
- Auth: email/password + JWT bearer

## Estado actual (Phase 2)

- Auth (`register/login/refresh/logout/reset-password`) con lockout y `Retry-After` en 429
- Portfolio / Config / Watchlist persistidos en PostgreSQL
- Market proxy backend para quote/candles/forex/commodity/profile
- Migración `localStorage -> backend` vía `POST /api/migrate`
- Grupos: crear, unirse, renombrar, eliminar grupo, ver detalle, expulsar miembro, salir
- Detalle de grupos con posiciones read-only y `plPercent` live (sin exponer `buyPrice`)

## Variables de entorno (frontend)

Crear `/Users/nmayerwolf/Documents/nexusfin/.env` desde `.env.example`:

```bash
VITE_API_URL=http://localhost:3001/api
VITE_ANTHROPIC_KEY=
```

Notas:
- `VITE_API_URL` debe apuntar al backend.
- Las keys de Finnhub/Alpha Vantage no van en frontend.

## Desarrollo local

1. Backend

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm install
npm run migrate
npm run dev
```

2. Frontend

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm install
npm run dev
```

## Calidad

Frontend:

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm run check
npm run test:coverage
```

Backend:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check
```

## Deploy (mínimo recomendado)

1. Provisionar PostgreSQL (Railway / Neon / Supabase).
2. Deploy backend con variables de `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/.env.example`.
3. Ejecutar migraciones en backend: `npm run migrate`.
4. Deploy frontend con `VITE_API_URL=https://<tu-backend>/api`.
5. Ejecutar smoke test del release usando `/Users/nmayerwolf/Documents/nexusfin/RELEASE_CHECKLIST.md`.

## CI

Pipeline en `/Users/nmayerwolf/Documents/nexusfin/.github/workflows/ci.yml`:
- test matrix Node 20.x / 22.x
- build frontend

## Nota importante sobre PR

Abrí siempre los PR contra `main` para que corra CI:
- `base: main`
- `compare: codex/<tu-rama>`
