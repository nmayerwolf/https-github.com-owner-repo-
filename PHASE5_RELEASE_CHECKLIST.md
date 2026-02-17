# PHASE 5 CHECKLIST

Fecha: 2026-02-17

## 1) Scope y planificación

- [ ] Aprobado alcance de Fase 5 (bloques y prioridades).
- [ ] Definido criterio de “done” por bloque.

## 2) Calidad web/api/mobile

- [ ] `npm run check` (web) en verde.
- [ ] `cd nexusfin-api && DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check` en verde.
- [ ] `npm -C nexusfin-mobile run release:preflight` en verde.
- [ ] E2E crítico en verde (`npm run test:e2e`).

## 3) UX y runtime

- [ ] Sin desbordes visuales en tabs/screen core.
- [ ] Estados offline/WS/session claros y no intrusivos.
- [ ] Mercados con degradación controlada y carga estable.
- [ ] Detalles de señales AI robustos ante datos parciales.

## 4) Entrega técnica

- [ ] Branch sincronizada con `main`.
- [ ] PR(s) con checks verdes y sin conflictos.
- [ ] Documentación Fase 5 actualizada.

## 5) Release operativo (si aplica al bloque)

- [ ] Build iOS/Android producción ejecutado.
- [ ] Submit TestFlight/Play Internal ejecutado.
- [ ] Smoke real en device completado.
