# Phase 3 Smoke Runbook

Fecha: 2026-02-14
Branch objetivo: `codex/nexusfin-phase3-final`

## 1) Gate automático previo

Script rápido (recomendado):

```bash
cd /Users/nmayerwolf/Documents/nexusfin
./scripts/phase3_gate.sh
```

Manual:

Web:

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm run check
```

API:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check
```

## 2) Health backend mínimo

```bash
curl -s http://localhost:3001/api/health | jq
curl -s http://localhost:3001/api/health/mobile | jq
curl -s http://localhost:3001/api/health/phase3 | jq
```

Esperado:
- `health.ok = true`
- `health/mobile.ok = true`
- `health/phase3.score` cercano a `total` según envs productivos (OAuth/Push).

## 3) Smoke manual mobile (dispositivo físico)

Auth:
- Login email/password.
- OAuth Google.
- OAuth Apple.
- Logout y re-login.

Onboarding/Settings:
- Completar onboarding 4 pasos.
- Cambiar tema y verificar persistencia.
- Guardar preferencias de notificaciones.
- Revisar bloque `Fase 3 readiness`.

Push:
- Activar push nativo.
- Enviar push de prueba desde Settings.
- Desactivar push nativo.

Markets:
- Carga de universo dinámico (`/api/market/universe`).
- Realtime WS y refresh.
- Watchlist add/remove + filtro `WATCHLIST`.

Alerts:
- Tabs `En vivo / Historial / Performance`.
- Compartir alerta a grupo.

Groups:
- Crear grupo.
- Unirse por código.
- Renombrar (admin).
- Remover miembro (admin).
- Publicar nota en feed.
- Reaccionar `agree/disagree`.
- Salir/eliminar grupo.

## 4) Gate final de merge

- CI de GitHub en verde para la PR.
- Sin conflictos con `main`.
- Confirmar migraciones ejecutadas en target:
  - `001_initial.sql`
  - `002_phase3_foundation.sql`
  - `003_push_subscription_dedupe.sql`

## 5) Merge

- Base: `main`
- Compare: `codex/nexusfin-phase3-final`
- Merge según política del repo (squash o merge commit).
