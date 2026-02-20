ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

UPDATE users
SET role = COALESCE(NULLIF(role, ''), 'user')
WHERE role IS NULL OR role = '';

UPDATE users
SET role = 'superadmin'
WHERE LOWER(email) = 'nmayerwolf@gmail.com';

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  symbol TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user
  ON ai_usage_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_date
  ON ai_usage_log(created_at);
