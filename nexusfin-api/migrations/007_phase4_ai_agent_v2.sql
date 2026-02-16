CREATE TABLE IF NOT EXISTS macro_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_sentiment TEXT NOT NULL CHECK (market_sentiment IN ('bullish', 'neutral', 'bearish')),
  sentiment_reasoning TEXT,
  themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_macro_insights_user ON macro_insights(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS portfolio_advice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  health_score INTEGER,
  health_summary TEXT,
  concentration_risk TEXT,
  allocation_analysis JSONB,
  recommendations JSONB,
  ai_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_advice_user ON portfolio_advice(user_id, created_at DESC);

ALTER TABLE IF EXISTS alerts
  ADD COLUMN IF NOT EXISTS outcome_24h TEXT CHECK (outcome_24h IN ('win', 'loss', 'open')),
  ADD COLUMN IF NOT EXISTS outcome_7d TEXT CHECK (outcome_7d IN ('win', 'loss', 'open')),
  ADD COLUMN IF NOT EXISTS outcome_30d TEXT CHECK (outcome_30d IN ('win', 'loss', 'open')),
  ADD COLUMN IF NOT EXISTS price_at_24h DECIMAL(20,8),
  ADD COLUMN IF NOT EXISTS price_at_7d DECIMAL(20,8),
  ADD COLUMN IF NOT EXISTS price_at_30d DECIMAL(20,8);
