CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK(type IN ('opportunity', 'bearish', 'stop_loss')),
  recommendation VARCHAR(20) NOT NULL,
  confidence VARCHAR(10) NOT NULL,
  confluence_bull INTEGER NOT NULL DEFAULT 0,
  confluence_bear INTEGER NOT NULL DEFAULT 0,
  signals JSONB NOT NULL DEFAULT '[]',
  price_at_alert DECIMAL(20,8) NOT NULL,
  stop_loss DECIMAL(20,8),
  take_profit DECIMAL(20,8),
  outcome VARCHAR(10) CHECK(outcome IN ('win', 'loss', 'open')),
  outcome_price DECIMAL(20,8),
  outcome_date TIMESTAMPTZ,
  ai_thesis JSONB,
  snapshot JSONB,
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_outcome ON alerts(user_id, outcome);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(10) NOT NULL CHECK(platform IN ('web', 'ios', 'android')),
  subscription JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id) WHERE active = true;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stop_loss BOOLEAN DEFAULT true,
  opportunities BOOLEAN DEFAULT true,
  group_activity BOOLEAN DEFAULT true,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(30) NOT NULL CHECK(type IN (
    'position_opened', 'position_sold', 'signal_shared', 'member_joined', 'member_left'
  )),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_events ON group_events(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_reactions (
  event_id UUID NOT NULL REFERENCES group_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction VARCHAR(10) NOT NULL CHECK(reaction IN ('agree', 'disagree')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS shared_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES users(id),
  shared_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alert_id, group_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth ON users(auth_provider, oauth_id)
  WHERE oauth_id IS NOT NULL;
