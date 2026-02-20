# NexusFin Phase 2 Release Checklist

## 1. Pre-check local

Frontend:

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm install
npm run check
```

Backend:

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm install
DATABASE_URL=postgres://test:test@localhost:5432/test JWT_SECRET=test-secret npm run check
```

## 2. Required env vars

Frontend (`.env`):

```bash
VITE_API_URL=https://<backend-domain>/api
VITE_ANTHROPIC_KEY=
```

Backend (`.env`):

```bash
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/nexusfin
JWT_SECRET=<secret-64-chars-min>
FINNHUB_KEY=<key>
ALPHA_VANTAGE_KEY=<key>
TWELVE_DATA_KEY=<key>
FRONTEND_URL=https://<frontend-domain>
NODE_ENV=production
```

## 3. Backend release

```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm run migrate
npm run start
```

## 4. Frontend release

```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm run build
```

## 5. Smoke tests (manual)

- `GET /api/health` returns `{ "ok": true }` (requires DB reachable from backend runtime).
- Auth Google works (`/api/auth/google` callback flow).
- Gmail-only enforced (non-gmail account is rejected).
- `GET|POST /api/auth/apple/callback` returns `oauth_error=provider_disabled` (expected).
- `POST /api/auth/register` and `POST /api/auth/login` return `403 GOOGLE_OAUTH_ONLY` (expected).
- Logout works and next protected call requires re-login.
- `POST /api/auth/forgot-password` and `POST /api/auth/reset-password*` return `403 GOOGLE_OAUTH_ONLY` (expected).
- Dashboard loads market data via backend.
- Portfolio CRUD persists after reload.
- Config changes persist after reload.
- Watchlist add/remove persists after reload.
- Groups: create, join, rename, delete group, remove member, leave.
- `POST /api/admin/jobs/run` executes selected jobs with `x-admin-token`.
- `GET /api/admin/jobs/runs` and `GET /api/admin/jobs/status` return run history.

## 6. PR sanity

- PR base branch is `main`.
- All CI checks are green.
