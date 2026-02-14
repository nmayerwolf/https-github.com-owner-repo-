# NexusFin Mobile (Expo)

MVP mobile para Fase 3 con:
- login email/password mobile (token bearer)
- OAuth mobile (Google/Apple) con deep-link `nexusfin://oauth` y token session bootstrap
- tabs básicas (Dashboard, Markets, Alerts, Groups, Settings)
- tab Groups social (crear/unirse/listar, detalle de miembros/posiciones, renombrar/remover miembros si admin, publicar notas al feed y reacciones agree/disagree)
- onboarding guiado de 4 pasos al primer login (riesgo, sectores, horizonte, push)
- theme toggle claro/oscuro persistente
- markets realtime multi-activo expandido (acciones, ETF, bonos, metales, commodities, crypto, FX; 40+ símbolos)
- universo realtime de markets consumido dinámicamente desde backend (`GET /api/market/universe`) con fallback local
- watchlist add/remove desde mobile (sync con backend) + filtro `WATCHLIST` + gestión de símbolos externos al universo mobile
- alertas con fetch inicial + refresh manual + stream en vivo por `WS /ws`
- alertas mobile con tabs `En vivo / Historial / Performance` y filtros
- compartir alertas a grupos desde mobile (`POST /api/alerts/:id/share`)
- registro de push nativo Expo (`ios`/`android`) contra backend `/api/notifications/subscribe`
- logout mobile revoca sesión backend (`POST /api/auth/logout`) además de limpiar token local/push
- botón en Settings para enviar push de prueba (`POST /api/notifications/test`)
- bloque `Fase 3 readiness` en Settings (consume `GET /api/health/phase3`)
- desuscripción automática al cerrar sesión (`DELETE /api/notifications/subscribe/:id`)
- preferencias de notificaciones (stop-loss/oportunidades/grupo + quiet hours UTC)

## Setup

1. Instalar dependencias:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile
npm install
```

2. Configurar API:

```bash
cp .env.example .env
```

Asegurar:
- `EXPO_PUBLIC_API_URL=http://<host-backend>:3001/api`

Notas:
- En emulador Android podés usar `10.0.2.2` como host local.
- Push nativo requiere dispositivo físico para token Expo real.

## Run

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile
npm start
```

Luego abrir en:
- iOS simulator / device
- Android emulator / device
