ALTER TABLE IF EXISTS fundamentals_snapshot
  ADD COLUMN IF NOT EXISTS snapshot_date DATE,
  ADD COLUMN IF NOT EXISTS market_cap NUMERIC,
  ADD COLUMN IF NOT EXISTS pe_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS forward_pe NUMERIC,
  ADD COLUMN IF NOT EXISTS dividend_yield NUMERIC,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS beta NUMERIC,
  ADD COLUMN IF NOT EXISTS eps_ttm NUMERIC,
  ADD COLUMN IF NOT EXISTS revenue_growth NUMERIC,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'finnhub',
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ DEFAULT NOW();

UPDATE fundamentals_snapshot
SET snapshot_date = COALESCE(snapshot_date, asof_date);

ALTER TABLE IF EXISTS news_items
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS related_symbols TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_news_items_published ON news_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_items_category ON news_items(category);

ALTER TABLE IF EXISTS daily_digest
  ADD COLUMN IF NOT EXISTS digest_date DATE,
  ADD COLUMN IF NOT EXISTS regime TEXT,
  ADD COLUMN IF NOT EXISTS volatility_regime TEXT,
  ADD COLUMN IF NOT EXISTS leadership JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS key_risks JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS macro_drivers JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS crisis_active BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE daily_digest
SET
  digest_date = COALESCE(digest_date, date),
  regime = COALESCE(regime, NULLIF(regime_summary, '')),
  leadership = COALESCE(leadership, themes),
  key_risks = COALESCE(key_risks, risk_flags),
  generated_at = COALESCE(generated_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_digest_user_digest_date
  ON daily_digest(user_id, digest_date);

ALTER TABLE IF EXISTS base_ideas
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS idea_date DATE,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE base_ideas
SET
  idea_date = COALESCE(idea_date, date),
  generated_at = COALESCE(generated_at, created_at);

CREATE INDEX IF NOT EXISTS idx_base_ideas_date ON base_ideas(idea_date DESC);

ALTER TABLE IF EXISTS user_recommendations
  ADD COLUMN IF NOT EXISTS reco_date DATE,
  ADD COLUMN IF NOT EXISTS strategic JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS opportunistic JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_alerts JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE user_recommendations
SET
  reco_date = COALESCE(reco_date, date),
  generated_at = COALESCE(generated_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_recommendations_user_reco_date
  ON user_recommendations(user_id, reco_date);

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_feature_created
  ON ai_usage_log(feature, created_at DESC);
