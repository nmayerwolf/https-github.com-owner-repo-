# PHASE 4 CLOSEOUT

Fecha: 2026-02-17
Branch de trabajo: `codex/release-notes-v1`

## 1. Estado general

Fase 4 quedó implementada a nivel producto/arquitectura en código para web, API y mobile.

## 2. Entregado

- WebSocket Hub backend autenticado (`/ws`) con suscripción por símbolos.
- Cron server-side multi-activo y estado operativo (`GET /api/health/cron`).
- Outcome evaluation de alertas (`win/loss/open`) en backend.
- Outcome tracking extendido por ventana:
  - `outcome_24h`, `outcome_7d`, `outcome_30d`
  - `price_at_24h`, `price_at_7d`, `price_at_30d`
- Export CSV de portfolio (`GET /api/export/portfolio?format=csv&filter=all|active|sold`).
- Auth web con cookie `httpOnly` + CSRF para mutaciones.
- Password reset completo:
  - `POST /api/auth/forgot-password`
  - `POST /api/auth/reset-password`
  - migración `nexusfin-api/migrations/006_phase4_password_reset_tokens.sql`
- Web Push para navegador (VAPID + service worker) y push móvil Expo.
- Monorepo base con workspace y paquete compartido:
  - `pnpm-workspace.yaml`
  - `packages/nexusfin-core/`
- E2E web con Playwright (smoke + login->portfolio).
- AI Agent v2 (Sprint 1 + Sprint 2):
  - Señales contextuales (perfil, watchlist, posición abierta, historial y noticias).
  - Señales de entrada fuera de watchlist (discovery) en ciclos cron.
  - Macro Radar:
    - tabla `macro_insights`
    - `GET /api/alerts/macro`
    - `POST /api/alerts/macro/refresh`
    - sub-tab `Macro` en Agente IA.
  - Portfolio Advisor:
    - tabla `portfolio_advice`
    - `GET /api/alerts/portfolio-advice`
    - `POST /api/alerts/portfolio-advice/refresh`
    - UI en Agente IA y Cartera.
  - Performance del agente extendida:
    - `hitRate24h`, `hitRate7d`, `hitRate30d`
    - precisión por tipo y por asset class
    - trend de últimas 30 señales cerradas
    - mejor/peor señal del mes.
- App Store readiness móvil:
  - `nexusfin-mobile/eas.json`
  - `nexusfin-mobile/app.json` con icon/splash/adaptive config
  - `nexusfin-mobile/assets/*`
  - `nexusfin-mobile/APP_STORE_METADATA.md`

## 3. Evidencia de checks (local)

- Web quality gate: `npm run check` -> OK.
- E2E: `npm run test:e2e` -> 2/2 OK.
- API coverage: `cd nexusfin-api && DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run test:coverage` -> 20 suites, 156 tests OK.

## 4. Pendiente para cierre de release (operativo)

Esto no bloquea código, pero sí el release público:

- Ejecutar builds reales EAS con credenciales de organización:
  - `npx eas build --platform ios --profile production`
  - `npx eas build --platform android --profile production`
- Submit real a stores:
  - `npx eas submit --platform ios --profile production` (TestFlight)
  - `npx eas submit --platform android --profile production` (Play Internal)
- Validación final en dispositivos reales (deep links, push, offline UX, onboarding).

## 5. Pendiente Fase 4 (no bloqueante de este bloque)

- Mobile release real en stores (TestFlight/Play Internal) con credenciales productivas.
- Pulido UX móvil adicional (si se quiere) antes de release público.
- Iteración de cobertura opcional en runtime WS/cron.

## 6. Nota de cobertura

Frontend queda sólido para gates del proyecto; backend tiene cobertura funcional completa en rutas críticas de Fase 4, con áreas técnicas de baja cobertura aún en módulos de runtime WS/cron que se pueden mejorar en iteración posterior.
