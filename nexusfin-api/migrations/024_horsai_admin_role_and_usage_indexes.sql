ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

UPDATE users
SET role = COALESCE(NULLIF(role, ''), 'user')
WHERE role IS NULL OR role = '';

UPDATE users
SET role = 'superadmin'
WHERE LOWER(email) = 'nmayerwolf@gmail.com';

CREATE INDEX IF NOT EXISTS idx_ai_usage_user
  ON ai_usage_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_date
  ON ai_usage_log(created_at);
