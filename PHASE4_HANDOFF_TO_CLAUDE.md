# PHASE 4 HANDOFF TO CLAUDE

Fecha: 2026-02-17  
Repo: `/Users/nmayerwolf/Documents/nexusfin`  
Branch activa: `codex/release-notes-v1`

## 1) Estado final (código)

Fase 4 está implementada en código (web + API + mobile), incluyendo AI Agent v2 (Sprint 1 + Sprint 2), seguridad, realtime, cron, outcomes por ventana, y release tooling.

### Entregado (confirmado en repo)

- WebSocket Hub autenticado (`/ws`) con subscribe/unsubscribe.
- Cron backend + health (`GET /api/health/cron`).
- Outcome engine extendido (`outcome_24h`, `outcome_7d`, `outcome_30d` + prices por ventana).
- Export CSV portfolio y export PDF de alerta.
- Auth web con cookie `httpOnly` + CSRF para mutaciones.
- Password reset (`forgot-password` / `reset-password`).
- Web Push browser + push mobile Expo.
- Monorepo scaffold + package compartido `@nexusfin/core`.
- E2E web (Playwright) y gates de calidad.
- AI Agent v2:
  - señales contextuales,
  - señales discovery fuera de watchlist,
  - Macro Radar (`macro_insights`, `GET/POST /api/alerts/macro`),
  - Portfolio Advisor (`portfolio_advice`, `GET/POST /api/alerts/portfolio-advice`),
  - rendimiento extendido (24h/7d/30d, precisión por tipo y asset class).
- UX/UI recientes:
  - normalización de ancho y overflow en web,
  - fix UI notificaciones en Ajustes web,
  - hardening en detalle de tesis AI (evita crash por payloads con strings),
  - mobile: `SettingsScreen` con scroll estable + tabs inferiores más robustas.

## 2) Commits más recientes (después del closeout)

- `984aebf` fix(mobile): stabilize settings notifications layout and tab labels
- `dcc348e` fix(alerts): harden AI thesis detail rendering
- `7ac2873` fix(ui): normalize mobile width and notifications layout

## 3) Pendientes exactos de Fase 4

## P0 (obligatorio para cierre real de fase)

1. Sincronizar branch con `main` antes de merge final.
   - Estado actual: `main...HEAD = behind 2 / ahead 253`.
2. PR final con CI verde (web + api + e2e).
3. Release mobile real en stores (operativo, fuera de código):
   - `eas build` iOS/Android producción.
   - `eas submit` a TestFlight + Play Internal.
4. Smoke final en dispositivos reales (iOS/Android):
   - login, onboarding, markets, alerts, push, logout, deep link.

## P1 (recomendado antes de release público)

1. Pulido UX móvil final (iteración visual/performance).
2. Cobertura adicional opcional para runtime WS/cron backend.

## 4) Validaciones recientes y evidencia

- Web check local: `npm run check` OK (tras fixes UI).
- Mobile preflight: `npm -C /Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile run release:preflight` OK.
- Docs de cierre existentes:
  - `/Users/nmayerwolf/Documents/nexusfin/PHASE4_CLOSEOUT.md`
  - `/Users/nmayerwolf/Documents/nexusfin/PHASE4_SMOKE_RUNBOOK.md`
  - `/Users/nmayerwolf/Documents/nexusfin/PHASE4_RELEASE_CHECKLIST.md`
  - `/Users/nmayerwolf/Documents/nexusfin/PHASE4_AUDIT_BUNDLE.md`

## 5) Playbook recomendado para Claude (orden)

1. Traer `main` y resolver divergencia (behind 2 / ahead 253) en `codex/release-notes-v1`.
2. Ejecutar gate completo:
   - `/Users/nmayerwolf/Documents/nexusfin/scripts/phase4_gate.sh`
3. Dejar PR final listo para merge (sin conflictos, checks en verde).
4. Asistir en release operativo mobile:
   - build + submit + checklist de smoke real.
5. Actualizar closeout final con resultado de stores y fecha de cierre.

## 6) Notas para evitar confusión

- “Fase 4 implementada” en repo no implica “Fase 4 cerrada operativamente”.
- El cierre formal depende de:
  - merge final a `main`,
  - stores (build + submit),
  - smoke real en devices.
