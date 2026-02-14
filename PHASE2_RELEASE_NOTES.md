# NexusFin Phase 2 Release Notes

Fecha: 2026-02-13

## Alcance entregado

- Backend Node/Express + PostgreSQL con auth JWT.
- Proxy seguro de market data (Finnhub / Alpha Vantage) sin exponer keys en frontend.
- Persistencia multiusuario para:
  - portfolio
  - config
  - watchlist
- Migración de datos localStorage -> backend (`POST /api/migrate`).
- Grupos:
  - crear
  - unirse
  - renombrar
  - eliminar grupo (admin)
  - expulsar miembro (admin)
  - salir del grupo
  - detalle read-only con `plPercent` live
- Auth hardening:
  - lockout + `Retry-After`
  - refresh de token
  - logout con invalidación de sesión activa
  - reset-password con invalidación de otras sesiones

## Endpoints críticos validados

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/reset-password`
- `GET|POST|PATCH|DELETE /api/portfolio`
- `GET|PUT /api/config`
- `GET|POST|DELETE /api/watchlist`
- `GET /api/market/*`
- `POST /api/groups`
- `POST /api/groups/join`
- `GET /api/groups`
- `GET /api/groups/:id`
- `PATCH /api/groups/:id`
- `DELETE /api/groups/:id`
- `DELETE /api/groups/:id/members/:userId`
- `DELETE /api/groups/:id/leave`
- `POST /api/migrate`

## Validación de release

Frontend:

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm run check
```

Backend:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check
```

## Known limitations (Phase 2)

- Sin app móvil nativa.
- Sin push notifications.
- Sin OAuth.
- Sin persistencia histórica de alertas.
- Sin panel admin.

## Rollout recomendado

1. Deploy backend + migraciones.
2. Verificar `GET /api/health`.
3. Deploy frontend con `VITE_API_URL` de producción.
4. Ejecutar `/Users/nmayerwolf/Documents/nexusfin/RELEASE_CHECKLIST.md` completo.
