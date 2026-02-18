CREATE TABLE IF NOT EXISTS news_telemetry_events (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  item_key TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'global',
  score NUMERIC,
  headline TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_telemetry_user_created ON news_telemetry_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_telemetry_user_theme ON news_telemetry_events(user_id, theme);

