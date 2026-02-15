# NexusFin v1.0.0

Fecha de release: 2026-02-15  
Tag: `v1.0.0`

## Highlights

- Cierre técnico de Fase 4 en web, API y mobile.
- Realtime robusto con WebSocket Hub backend autenticado (`/ws`).
- Cron server-side para análisis/alertas y endpoint de estado (`GET /api/health/cron`).
- Evaluación de outcomes de alertas (`win/loss/open`) en backend.
- Seguridad reforzada:
  - auth web con cookie `httpOnly` + CSRF,
  - reset de contraseña por token (`forgot/reset`).
- Export de datos:
  - CSV de portfolio (`GET /api/export/portfolio?format=csv`),
  - PDF de alerta (`GET|POST /api/export/alert/:id?format=pdf`).
- Push:
  - navegador (VAPID + service worker),
  - mobile nativo (Expo).
- Mobile release readiness:
  - `nexusfin-mobile/app.json`, `nexusfin-mobile/eas.json`,
  - assets de app/splash,
  - metadata base para stores.
- Calidad/operación:
  - CI con cobertura API y E2E Playwright,
  - gate de release Fase 4 y bundle de auditoría.

## Validaciones ejecutadas

- `npm run check`
- `npm run test:e2e`
- `cd nexusfin-api && DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run test:coverage`
- `./scripts/phase4_gate.sh`
- `./scripts/phase4_release_pack.sh`
- `npm -C nexusfin-mobile run release:preflight`
- `npm -C nexusfin-mobile run release:store:dry`

## Artefactos de cierre

- `PHASE4_CLOSEOUT.md`
- `PHASE4_SMOKE_RUNBOOK.md`
- `PHASE4_RELEASE_CHECKLIST.md`
- `PHASE4_AUDIT_BUNDLE.md`
- `scripts/phase4_gate.sh`
- `scripts/phase4_release_pack.sh`

## Pendiente operativo (fuera de código)

- Ejecutar build real iOS/Android:
  - `npm -C nexusfin-mobile run release:store` (con credenciales EAS).
- Submit real a TestFlight y Play Internal.
- Smoke final en dispositivos reales post-submit.
