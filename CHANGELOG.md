# Changelog

Todas las fechas en este changelog usan formato `YYYY-MM-DD`.

## [4.0.0] - 2026-02-15

### Added
- WebSocket Hub backend (`/ws`) con autenticación y suscripción de símbolos.
- Cron server-side para análisis multi-activo y endpoint de estado (`GET /api/health/cron`).
- Outcome evaluation de alertas (`win/loss/open`) ejecutado en backend.
- AI Agent opcional para validar señales y controles anti-spam (cooldowns + límites diarios).
- Export CSV de portfolio (`GET /api/export/portfolio?format=csv&filter=all|active|sold`).
- Flujo de reset de contraseña por token:
  - `POST /api/auth/forgot-password`
  - `POST /api/auth/reset-password`
- Escaneo de secretos en bundle frontend (`scripts/check_frontend_bundle_secrets.sh`) integrado en CI.

### Changed
- Hardening de rate limiting en market proxy por usuario autenticado.
- Sanitización de texto libre en endpoints de grupos y portfolio.
- Cobertura frontend elevada en módulos críticos (`AppContext`, `confluence`).
- Documentación unificada de setup y operación (web + api + mobile).

### Fixed
- Prevención de exposición de API keys de mercado en el build frontend.
- Ajustes de estabilidad en tests de auth/reset y motor de alertas.

## [3.0.0] - 2026-02-14

### Added
- Onboarding guiado mobile de 4 pasos.
- Theme toggle claro/oscuro persistente.
- OAuth mobile Google/Apple con deep-links.
- Universe multi-activo y mejoras de realtime.
- Watchlist avanzada (sync backend + filtros).
- Alertas mobile (En vivo / Historial / Performance).
- Compartir alertas a grupos (`POST /api/alerts/:id/share`).
- Push nativo mobile (Expo): subscribe/unsubscribe/preferences/test push.
- Export PDF de alerta (`GET|POST /api/export/alert/:id?format=pdf`).
- Health endpoint de Fase 3 (`GET /api/health/phase3`).

## [2.0.0] - 2026-02-13

### Added
- Fortalecimiento de auth y sesiones.
- Expansión de endpoints para grupos/social.
- Cobertura de tests backend ampliada y gates de CI más estrictos.

## [1.0.0] - 2026-02-12

### Added
- Base de NexusFin web (React + Vite) y API (Node + Express + PostgreSQL).
- Módulos iniciales de auth, market proxy, portfolio y watchlist.
- Pipeline inicial de tests y build.
