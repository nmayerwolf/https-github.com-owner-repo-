# Horsai V1

Horsai V1 es una plataforma AI de inversión con 3 módulos:
- Brief (contexto diario, informativo)
- Ideas (análisis estructurado + scoring de convicción)
- Portfolio (holdings, exposiciones y challenges)

## Estructura

- Web: `/Users/nmayerwolf/Documents/nexusfin`
- API: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api`
- Mobile: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile`

## Quickstart

1. API

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
cp .env.example .env
npm install
npm run migrate
npm run start
```

2. Web

```bash
cd /Users/nmayerwolf/Documents/nexusfin
cp .env.example .env
npm install
npm run dev
```

## Validación rápida

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm test
npm run build
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm test
```

## Smoke V1

Modo lectura:

```bash
cd /Users/nmayerwolf/Documents/nexusfin
bash ./scripts/v1_smoke.sh http://localhost:3001
```

Modo admin:

```bash
cd /Users/nmayerwolf/Documents/nexusfin
MODE=admin bash ./scripts/v1_smoke.sh http://localhost:3001
```

Notas:
- En localhost, el script puede autogenerar JWT si no pasás `JWT_TOKEN`.
- Si `MODE=admin`, toma `ADMIN_JOB_TOKEN` desde `nexusfin-api/.env` si no está exportado.

## Endpoints V1 (backend)

- `GET /api/brief/today`
- `GET /api/brief/:date`
- `GET /api/ideas`
- `GET /api/ideas/:id`
- `POST /api/ideas/analyze`
- `POST /api/ideas/:id/review`
- `POST /api/ideas/:id/close`
- `GET /api/portfolio`
- `POST /api/portfolio`
- `POST /api/portfolio/holdings`
- `GET /api/portfolio/challenges`
- `GET /api/packages/today`
- `GET /api/packages/:date`
- `POST /api/admin/jobs/run`
- `GET /api/admin/jobs/status`

## Migraciones activas

- `nexusfin-api/migrations/001_conviction_engine_schema.sql`
- `nexusfin-api/migrations/002_ideas_module_schema.sql`
