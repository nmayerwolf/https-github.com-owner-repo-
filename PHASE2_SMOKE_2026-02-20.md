# Phase 2 Smoke Report

Fecha: 2026-02-20
Entorno: local (`/Users/nmayerwolf/Documents/nexusfin`)

## Validaciones ejecutadas

- Frontend check: `npm run check` -> OK.
- Backend check: `DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check` -> OK.
- Deploy preflight: `./scripts/deploy_preflight.sh` -> OK.
- Smoke HTTP runtime (API en `:3101`):
  - `POST /api/auth/register` -> `403 GOOGLE_OAUTH_ONLY` (esperado).
  - `POST /api/auth/login` -> `403 GOOGLE_OAUTH_ONLY` (esperado).
  - `GET /api/portfolio` sin token -> `401 TOKEN_REQUIRED` (esperado).
  - `GET /api/health` -> `500 { "ok": false, "db": "down" }` (DB no alcanzable en este runtime).

## Resultado

- Estado funcional de código: verde por suite de tests + checks.
- Pendiente para release final: validar `GET /api/health` con base de datos activa en entorno objetivo y completar smoke OAuth end-to-end con proveedor configurado.
