CREATE TABLE IF NOT EXISTS admin_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  requester_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  requester_ip VARCHAR(120),
  requester_user_agent VARCHAR(300),
  jobs JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(24) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_admin_job_runs_status CHECK (status IN ('success', 'partial_failed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_admin_job_runs_run_date
  ON admin_job_runs(run_date DESC);

CREATE INDEX IF NOT EXISTS idx_admin_job_runs_requester
  ON admin_job_runs(requester_user_id, created_at DESC);
