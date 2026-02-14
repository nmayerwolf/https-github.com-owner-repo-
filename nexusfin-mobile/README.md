# NexusFin Mobile (Expo)

MVP mobile para Fase 3 con:
- login email/password mobile (token bearer)
- tabs básicas (Dashboard, Alerts, Settings)
- registro de push nativo Expo (`ios`/`android`) contra backend `/api/notifications/subscribe`

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
