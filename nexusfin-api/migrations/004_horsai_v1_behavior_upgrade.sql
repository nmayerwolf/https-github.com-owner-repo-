BEGIN;

CREATE TABLE IF NOT EXISTS regime_snapshots (
  id BIGSERIAL PRIMARY KEY,
  as_of_date DATE NOT NULL,
  model_version TEXT NOT NULL,
  label TEXT NOT NULL,
  narrative TEXT NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (as_of_date, model_version)
);

CREATE TABLE IF NOT EXISTS radar_snapshots (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL,
  run_date DATE NOT NULL,
  radar_json JSONB NOT NULL,
  regime_bias TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radar_snapshots_run_date ON radar_snapshots (run_date DESC);

ALTER TABLE ideas
  ADD COLUMN IF NOT EXISTS idea_type TEXT,
  ADD COLUMN IF NOT EXISTS initial_conviction TEXT,
  ADD COLUMN IF NOT EXISTS current_conviction TEXT,
  ADD COLUMN IF NOT EXISTS thesis_summary TEXT,
  ADD COLUMN IF NOT EXISTS last_conviction_change_reason TEXT,
  ADD COLUMN IF NOT EXISTS error_type TEXT,
  ADD COLUMN IF NOT EXISTS thesis_broken BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS priority_score NUMERIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'idea_status') THEN
    BEGIN
      ALTER TYPE idea_status ADD VALUE IF NOT EXISTS 'Initiated';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE idea_status ADD VALUE IF NOT EXISTS 'Reinforced';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE idea_status ADD VALUE IF NOT EXISTS 'Under Review';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

UPDATE ideas
SET
  initial_conviction = COALESCE(initial_conviction, current_conviction, CASE WHEN conviction_score >= 85 THEN 'HIGH' WHEN conviction_score >= 65 THEN 'MEDIUM' ELSE 'LOW' END),
  current_conviction = COALESCE(current_conviction, CASE WHEN conviction_score >= 85 THEN 'HIGH' WHEN conviction_score >= 65 THEN 'MEDIUM' ELSE 'LOW' END),
  thesis_broken = COALESCE(thesis_broken, FALSE),
  priority_score = COALESCE(priority_score, ROUND(COALESCE(conviction_score, 50)::numeric, 2))
WHERE
  initial_conviction IS NULL
  OR current_conviction IS NULL
  OR thesis_broken IS NULL
  OR priority_score IS NULL;

CREATE TABLE IF NOT EXISTS idea_revisions (
  id BIGSERIAL PRIMARY KEY,
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  run_id UUID NOT NULL,
  previous_conviction TEXT,
  new_conviction TEXT,
  previous_status TEXT,
  new_status TEXT,
  change_reason TEXT,
  error_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idea_revisions_idea_id ON idea_revisions (idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_revisions_run_id ON idea_revisions (run_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_packages_brief_system
ON daily_packages (
  tenant_id,
  COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  kind,
  as_of_date
)
WHERE kind = 'brief_daily';

COMMIT;
