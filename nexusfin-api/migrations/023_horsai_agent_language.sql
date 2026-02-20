ALTER TABLE user_agent_profile
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es' CHECK (language IN ('en', 'es'));
