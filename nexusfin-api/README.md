# Nexusfin API (Horsai V1)

Backend Express + PostgreSQL para Horsai V1.

## Setup

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
cp .env.example .env
npm install
npm run migrate
npm run start
```

## Variables requeridas

- `DATABASE_URL`
- `JWT_SECRET`

## Variables recomendadas

- `CSRF_SECRET`
- `FRONTEND_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `CRON_ENABLED`
- `CRON_TIMEZONE` (`America/Argentina/Buenos_Aires`)
- `ADMIN_JOB_TOKEN`
- `ADMIN_JOB_TOKEN_NEXT`

Template:
- `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/.env.example`

## Migraciones

Activas:
- `001_conviction_engine_schema.sql`
- `002_ideas_module_schema.sql`

Runner:

```bash
npm run migrate
```

## Scripts

- `npm run start`
- `npm run dev`
- `npm run test`
- `npm run check`

## Endpoints V1

- `GET /api/health`
- `GET /api/health/cron`
- `GET /api/brief/today`
- `GET /api/brief/:date`
- `GET /api/ideas`
- `GET /api/ideas/:id`
- `POST /api/ideas/analyze`
- `POST /api/ideas/:id/review`
- `POST /api/ideas/:id/close`
- `GET /api/packages/today`
- `GET /api/packages/:date`
- `GET /api/portfolio`
- `POST /api/portfolio`
- `POST /api/portfolio/holdings`
- `GET /api/portfolio/challenges`
- `POST /api/admin/jobs/run`
- `GET /api/admin/jobs/status`

## Tests

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm test
```
