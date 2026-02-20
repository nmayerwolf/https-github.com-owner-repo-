# Horsai Deploy Closeout (Production)

Fecha: 2026-02-18

## Estado
- Frontend production: `https://horsai-web.vercel.app` OK
- Backend production: `https://https-githubcom-owner-repo-production.up.railway.app` OK
- Health check: `/api/health` responde `ok: true`
- OAuth Google: habilitado y funcionando

## Variables críticas (confirmadas)

### Railway (backend)
- `DATABASE_URL`
- `JWT_SECRET`
- `CSRF_SECRET`
- `NODE_ENV=production`
- `FRONTEND_URL=https://horsai-web.vercel.app`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL=https://https-githubcom-owner-repo-production.up.railway.app/api/auth/google/callback`
- `FINNHUB_KEY`
- `ALPHA_VANTAGE_KEY`
- `TWELVE_DATA_KEY`

### Vercel (frontend, Production)
- `VITE_API_URL=https://https-githubcom-owner-repo-production.up.railway.app/api`
- `VITE_WS_URL=wss://https-githubcom-owner-repo-production.up.railway.app/ws`

## Validaciones ejecutadas
- Backend deploy estable en Railway
- Frontend deploy estable en Vercel
- Routing y carga de assets en producción OK
- Login Google sin `OAUTH_PROVIDER_DISABLED`

## Supabase (pendiente de hardening, no bloqueante para deploy web/api)
- Se aplicó ajuste para RLS en `public.instruments`
- Revisión posterior recomendada en Security Advisor

## Checklist de smoke final (producción)
- [ ] Login Google
- [ ] Logout y re-login
- [ ] Mercados carga
- [ ] Watchlist agregar/quitar
- [ ] Cartera alta de posición
- [ ] Venta parcial y total
- [ ] Noticias y búsqueda
- [ ] Ajustes guardan correctamente

## Notas operativas
- Si un preview funciona y production no, promover deployment correcto a production.
- Evitar deploy de branch desactualizada para production.
