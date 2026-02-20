# Horsai Production Deploy Runbook

## 1. Objetivo
Publicar Horsai en:
- Frontend: Vercel (`horsai.app`)
- Backend + PostgreSQL: Railway (`api.horsai.app`)

## 2. Predeploy local
1. Ejecutar:
```bash
cd /Users/nmayerwolf/Documents/nexusfin
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret ./scripts/deploy_preflight.sh
```
2. Si falla, corregir antes de deploy.

## 3. Backend (Railway)
1. Crear proyecto en Railway desde GitHub.
2. Configurar `Root Directory`: `nexusfin-api`.
3. Railway tomará `nexusfin-api/railway.toml`.
4. Tomar como base:
```bash
cp /Users/nmayerwolf/Documents/nexusfin/nexusfin-api/.env.production.example /tmp/nexusfin-api.env
```
5. Variables mínimas:
```env
PORT=3001
DATABASE_URL=postgresql://...
JWT_SECRET=<64+ chars random>
CSRF_SECRET=<64+ chars random>
FINNHUB_KEY=<key>
ALPHA_VANTAGE_KEY=<key>
TWELVE_DATA_KEY=<key>
ANTHROPIC_API_KEY=<key>
AI_AGENT_ENABLED=true
CRON_ENABLED=true
REALTIME_ENABLED=false
FRONTEND_URL=https://horsai.app
NODE_ENV=production
COOKIE_DOMAIN=horsai.app
```
6. Verificar:
```bash
curl -sS https://api.horsai.app/api/health
curl -sS https://api.horsai.app/api/health/cron
```

## 4. Frontend (Vercel)
1. Importar repo en Vercel (root `.`).
2. Vercel usará `vercel.json`.
3. Tomar como base:
```bash
cp /Users/nmayerwolf/Documents/nexusfin/.env.production.example /tmp/nexusfin-web.env
```
4. Variables:
```env
VITE_API_URL=https://api.horsai.app/api
VITE_WS_URL=wss://api.horsai.app/ws
VITE_MARKET_VISIBLE=false
VITE_REALTIME_ENABLED=false
```
5. Verificar `https://horsai.app`.

## 5. DNS
- `horsai.app` -> Vercel
- `api.horsai.app` -> Railway

## 6. Smoke post-deploy
1. Login Google.
2. Mercado no visible en UI (oculto por feature flag).
3. Agregar/quitar watchlist.
4. Agente IA responde.
5. Noticias cargan.
6. Portfolio crea posición.
7. Realtime desactivado para MVP strict (si `REALTIME_ENABLED=true`, verificar WebSocket conecta).
8. `/api/health` y `/api/health/cron` OK.

## 7. Seguridad mínima obligatoria
- Nunca commitear `.env`.
- `JWT_SECRET`/`CSRF_SECRET` aleatorios.
- CORS solo `FRONTEND_URL`.
- Cookies `secure` en prod.
- Rate limit activo.
- `helmet()` activo.

## 8. Admin/Costos (siguiente bloque)
Este deploy no habilita aún panel superadmin completo. El tracking de noticias IA ya está activo; próximo paso es `ai_usage_log` + `/api/admin/*`.
