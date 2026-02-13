# NexusFin API (Phase 2)

Backend de NexusFin para auth, persistencia multi-usuario y proxy seguro de market data.

## Setup

1. Copiar `.env.example` a `.env`
2. Completar `DATABASE_URL`, `JWT_SECRET`, `FINNHUB_KEY`, `ALPHA_VANTAGE_KEY`
3. Instalar dependencias y migrar:

```bash
npm install
npm run migrate
npm run dev
```

## Endpoints principales

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET|POST|PATCH|DELETE /api/portfolio`
- `GET|PUT /api/config`
- `GET|POST|DELETE /api/watchlist`
- `GET /api/market/*` (proxy)
- `POST|GET|DELETE /api/groups*`
- `POST /api/migrate`

## Notas

- Todas las rutas excepto `/api/health` y `/api/auth/*` requieren JWT bearer.
- API keys viven exclusivamente en backend.
- Migración `localStorage -> DB` vía `POST /api/migrate`.
