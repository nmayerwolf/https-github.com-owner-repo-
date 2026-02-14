# NexusFin Mobile (Expo)

MVP mobile para Fase 3 con:
- login email/password mobile (token bearer)
- tabs básicas (Dashboard, Markets, Alerts, Settings)
- onboarding guiado de 4 pasos al primer login (riesgo, sectores, horizonte, push)
- theme toggle claro/oscuro persistente
- markets realtime multi-activo (acciones, ETF, bonos, metales, commodities, crypto, FX)
- watchlist add/remove desde mobile (sync con backend)
- alertas con fetch inicial + refresh manual + stream en vivo por `WS /ws`
- registro de push nativo Expo (`ios`/`android`) contra backend `/api/notifications/subscribe`
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
