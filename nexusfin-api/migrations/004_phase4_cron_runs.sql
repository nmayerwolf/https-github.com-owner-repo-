CREATE TABLE IF NOT EXISTS cron_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  alerts_generated INTEGER DEFAULT 0,
  stop_losses_checked INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at_desc ON cron_runs(started_at DESC);
