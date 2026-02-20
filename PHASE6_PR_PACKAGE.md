# PHASE 6 PR PACKAGE (Ready to Paste)

## PR Title
`MVP Final: Gmail-only auth, safe narratives, deterministic crisis/jobs, and production closeout`

## PR Summary
This PR finalizes the NexusFin MVP backend for production with strict batch-only behavior, Gmail-only authentication, deterministic scoring engines, crisis-aware policies, robust job tracking, and complete production runbooks.

## What Changed
- Auth hardened to Google OAuth + Gmail-only:
  - Email/password register/login/reset flows disabled.
  - Google callback restricted to `gmail.com` / `googlemail.com`.
- Narrative layer (LLM narrative-only) for digest/reco:
  - LLM rewrites approved narrative fields only.
  - Deterministic fallback always available.
- Locked contract hardening:
  - Digest guarantees regime/leadership/risk bullets.
  - Reco section shaping and field limits.
  - Portfolio error contract alignment (`DUPLICATE_HOLDING`, `INVITE_NOT_FOUND`, `INVITE_ALREADY_ACCEPTED`, etc.).
- Deterministic crisis mode strict inputs:
  - `spy_vol_20d_z` thresholds.
  - high-impact whitelist-driven `shock_event_flag`.
- Data + jobs:
  - market/fundamentals/news ingestion jobs.
  - daily MVP pipeline for regime/crisis/reco/digest.
  - portfolio snapshots + notification policy.
  - run tracking via `job_runs` (`started|success|failed`) by `job_name + run_date`.
- Admin ops:
  - `POST /api/admin/jobs/run`
  - `GET /api/admin/jobs/runs`
  - `GET /api/admin/jobs/status`
- Universe expansion migration:
  - `017_mvp_universe_expand.sql`.
- Production docs/runbooks updated + one-command smoke script.

## Migrations to Run in Production
- `012_mvp_phase1_core.sql`
- `013_phase1_active_holding_unique.sql`
- `014_phase6_mvp_contract.sql`
- `015_phase6_notification_events.sql`
- `016_phase6_admin_job_runs_audit.sql`
- `017_mvp_universe_expand.sql`

## Validation
- Backend test suites: `41/41` passing.
- Backend tests: `233/233` passing.

## Merge Checklist
1. Merge `codex/phase3-next` into `main`.
2. Deploy backend.
3. Run migrations in prod:
   - `cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api && npm run migrate`
4. Confirm env vars:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
   - `ADMIN_JOB_TOKEN` (+ optional `ADMIN_JOB_TOKEN_NEXT`)
   - `AI_NARRATIVE_ENABLED=true`, `ANTHROPIC_API_KEY`
   - `CRON_ENABLED=true`, `REALTIME_ENABLED=false`
5. Run smoke:
   - `cd /Users/nmayerwolf/Documents/nexusfin`
   - `JWT_TOKEN=<bearer> ADMIN_JOB_TOKEN=<admin-token> ./scripts/mvp_prod_smoke.sh https://api.horsai.app`

## Post-Deploy Success Criteria
- `/api/health` and `/api/health/cron` return `200`.
- `/api/news/digest/today`, `/api/reco/today`, `/api/crisis/today` return `200`.
- Admin jobs endpoints return expected payloads.
- Daily jobs produce records in `admin_job_runs` and `job_runs`.
- Non-Gmail OAuth login is rejected; Gmail OAuth login works.
