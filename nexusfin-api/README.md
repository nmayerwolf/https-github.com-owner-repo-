# NexusFin API (Phase 2)

Backend de NexusFin para auth, persistencia multi-usuario y proxy seguro de market data.

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
FINNHUB_KEY=<key>
ALPHA_VANTAGE_KEY=<key>
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

## Endpoints principales

Auth:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

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
- `DELETE /api/groups/:id/members/:userId`
- `DELETE /api/groups/:id/leave`

Migration:
- `POST /api/migrate`

Health:
- `GET /api/health`

## Reglas importantes

- Todas las rutas excepto `/api/health` y `/api/auth/*` requieren `Authorization: Bearer <jwt>`.
- API keys viven solo en backend.
- Lockout de login devuelve `429` con body `retryAfter` y header `Retry-After`.
- Migración localStorage se bloquea con `409 ALREADY_MIGRATED` si el usuario ya tiene datos.

## Tests

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm test
```
