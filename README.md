# NexusFin (Phase 2)

Plataforma de monitoreo financiero en tiempo real con análisis técnico, alertas, portfolio multi-usuario y grupos.

## Arquitectura

- Frontend: React + Vite + React Router (`/Users/nmayerwolf/Documents/nexusfin`)
- Backend: Node.js + Express + PostgreSQL (`/Users/nmayerwolf/Documents/nexusfin/nexusfin-api`)
- Market data proxy: Finnhub + Alpha Vantage (keys solo en backend)
- Auth: email/password + JWT bearer

## Estado actual (Phase 2)

- Auth (`register/login/refresh`) con lockout y `Retry-After` en 429
- Portfolio / Config / Watchlist persistidos en PostgreSQL
- Market proxy backend para quote/candles/forex/commodity/profile
- Migración `localStorage -> backend` vía `POST /api/migrate`
- Grupos: crear, unirse, renombrar, ver detalle, expulsar miembro, salir
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
npm test
npm run test:coverage
npm run build
```

Backend:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm test
```

## Deploy (mínimo recomendado)

1. Provisionar PostgreSQL (Railway / Neon / Supabase).
2. Deploy backend con variables de `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/.env.example`.
3. Deploy frontend con `VITE_API_URL=https://<tu-backend>/api`.
4. Ejecutar smoke test:
- `GET /api/health` devuelve `{ ok: true }`
- login/register funciona
- dashboard carga market data vía backend
- portfolio/config/watchlist persisten tras recargar
- groups create/join/detail/remove/leave funcionan

## CI

Pipeline en `/Users/nmayerwolf/Documents/nexusfin/.github/workflows/ci.yml`:
- test matrix Node 20.x / 22.x
- build frontend
