# Horsai Production Deploy Runbook

## 1. Objetivo
Publicar Horsai en:
- Frontend: Vercel (`horsai.app`)
- Backend + PostgreSQL: Railway (`api.horsai.app`)

Nota operativa:
- Sin staging por ahora. Validación local + CI + deploy directo a prod.

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
AI_NARRATIVE_ENABLED=true
CRON_ENABLED=true
REALTIME_ENABLED=false
FRONTEND_URL=https://horsai.app
NODE_ENV=production
COOKIE_DOMAIN=horsai.app
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
GOOGLE_CALLBACK_URL=https://api.horsai.app/api/auth/google/callback
ADMIN_JOB_TOKEN=<long-random-token>
ADMIN_JOB_TOKEN_NEXT=<optional-rotation-token>
```
6. Verificar:
```bash
curl -sS https://api.horsai.app/api/health
curl -sS https://api.horsai.app/api/health/cron
```
7. Aplicar migraciones en prod:
```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm run migrate
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
2. Validar Gmail-only (dominio no gmail debe rechazar OAuth callback).
3. Ejecutar jobs diarios: `POST /api/admin/jobs/run` con `x-admin-token`.
4. Verificar contratos MVP:
   - `GET /api/news/digest/today`
   - `GET /api/reco/today`
   - `GET /api/crisis/today`
5. Verificar monitoreo jobs:
   - `GET /api/admin/jobs/runs`
   - `GET /api/admin/jobs/status`
6. Portfolio: crear holdings + invitar + aceptar.
7. Mercado no visible en UI (feature flag).
8. Realtime desactivado para MVP strict (`REALTIME_ENABLED=false`).
9. `/api/health` y `/api/health/cron` OK.

Comando rápido (opcional):
```bash
cd /Users/nmayerwolf/Documents/nexusfin
JWT_TOKEN=<bearer> ADMIN_JOB_TOKEN=<admin-token> ./scripts/mvp_prod_smoke.sh https://api.horsai.app
```

## 7. Seguridad mínima obligatoria
- Nunca commitear `.env`.
- `JWT_SECRET`/`CSRF_SECRET` aleatorios.
- CORS solo `FRONTEND_URL`.
- Cookies `secure` en prod.
- Rate limit activo.
- `helmet()` activo.

## 8. Admin/Costos (siguiente bloque)
Este deploy no habilita aún panel superadmin completo. El tracking de noticias IA ya está activo; próximo paso es `ai_usage_log` + `/api/admin/*`.
