CREATE TABLE IF NOT EXISTS user_agent_profile (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preset_type VARCHAR(24) NOT NULL DEFAULT 'balanced',
  risk_level NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (risk_level >= 0 AND risk_level <= 1),
  horizon NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (horizon >= 0 AND horizon <= 1),
  focus NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (focus >= 0 AND focus <= 1),
  preferred_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  excluded_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  notification_mode VARCHAR(24) NOT NULL DEFAULT 'normal',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_agent_preset_type CHECK (preset_type IN ('strategic_core', 'balanced', 'opportunistic')),
  CONSTRAINT chk_agent_notification_mode CHECK (notification_mode IN ('normal', 'digest_only'))
);

CREATE TABLE IF NOT EXISTS universe_symbols (
  symbol VARCHAR(24) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  asset_type VARCHAR(24) NOT NULL,
  sector VARCHAR(64),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_universe_asset_type CHECK (asset_type IN ('equity', 'etf', 'bond', 'commodity', 'fx', 'crypto'))
);

CREATE TABLE IF NOT EXISTS market_daily_bars (
  symbol VARCHAR(24) NOT NULL,
  date DATE NOT NULL,
  open NUMERIC(20,8) NOT NULL,
  high NUMERIC(20,8) NOT NULL,
  low NUMERIC(20,8) NOT NULL,
  close NUMERIC(20,8) NOT NULL,
  volume NUMERIC(24,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, date)
);
CREATE INDEX IF NOT EXISTS idx_market_daily_bars_date ON market_daily_bars(date);

CREATE TABLE IF NOT EXISTS market_metrics_daily (
  symbol VARCHAR(24) NOT NULL,
  date DATE NOT NULL,
  ret_1d NUMERIC(10,6),
  ret_1w NUMERIC(10,6),
  ret_1m NUMERIC(10,6),
  ret_3m NUMERIC(10,6),
  vol_20d NUMERIC(10,6),
  vol_60d NUMERIC(10,6),
  ma20 NUMERIC(20,8),
  ma50 NUMERIC(20,8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, date)
);

CREATE TABLE IF NOT EXISTS fundamentals_snapshot (
  symbol VARCHAR(24) NOT NULL,
  asof_date DATE NOT NULL,
  pe NUMERIC(12,4),
  ev_ebitda NUMERIC(12,4),
  fcf_yield NUMERIC(12,4),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, asof_date)
);

CREATE TABLE IF NOT EXISTS fundamentals_derived (
  symbol VARCHAR(24) NOT NULL,
  asof_date DATE NOT NULL,
  sector VARCHAR(64),
  pe_percentile NUMERIC(6,3),
  ev_ebitda_percentile NUMERIC(6,3),
  fcf_yield_percentile NUMERIC(6,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, asof_date)
);

CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  source TEXT,
  headline TEXT NOT NULL,
  summary TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  tickers JSONB NOT NULL DEFAULT '[]'::jsonb,
  url TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_news_items_ts ON news_items(ts DESC);

CREATE TABLE IF NOT EXISTS daily_digest (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  regime_summary TEXT,
  crisis_banner JSONB NOT NULL DEFAULT '{}'::jsonb,
  themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_structured JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date),
  CONSTRAINT chk_digest_bullets_len CHECK (jsonb_typeof(bullets) = 'array' AND jsonb_array_length(bullets) <= 10)
);

CREATE TABLE IF NOT EXISTS regime_state (
  date DATE PRIMARY KEY,
  regime VARCHAR(24) NOT NULL,
  volatility_regime VARCHAR(24) NOT NULL,
  leadership JSONB NOT NULL DEFAULT '[]'::jsonb,
  macro_drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_regime_state_regime CHECK (regime IN ('risk_on', 'risk_off', 'transition')),
  CONSTRAINT chk_regime_state_volatility CHECK (volatility_regime IN ('normal', 'elevated', 'crisis'))
);

CREATE TABLE IF NOT EXISTS crisis_state (
  date DATE PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  learn_more JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS base_ideas (
  date DATE NOT NULL,
  idea_id TEXT NOT NULL,
  category VARCHAR(24) NOT NULL,
  symbol VARCHAR(24),
  action VARCHAR(16),
  confidence NUMERIC(5,4),
  timeframe VARCHAR(16),
  invalidation TEXT,
  rationale JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity VARCHAR(8),
  opportunistic_type VARCHAR(32),
  raw_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, idea_id),
  CONSTRAINT chk_base_ideas_category CHECK (category IN ('strategic', 'opportunistic', 'risk')),
  CONSTRAINT chk_base_ideas_action CHECK (action IS NULL OR action IN ('BUY', 'SELL', 'WATCH')),
  CONSTRAINT chk_base_ideas_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT chk_base_ideas_timeframe CHECK (timeframe IS NULL OR timeframe IN ('weeks', 'months')),
  CONSTRAINT chk_base_ideas_severity CHECK (severity IS NULL OR severity IN ('low', 'med', 'high')),
  CONSTRAINT chk_base_ideas_opp_type CHECK (
    opportunistic_type IS NULL OR opportunistic_type IN ('value_dislocation', 'overreaction', 'macro_divergence')
  )
);

CREATE TABLE IF NOT EXISTS user_recommendations (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_value NUMERIC(20,4),
  pnl_day NUMERIC(20,4),
  pnl_total NUMERIC(20,4),
  benchmark_ret NUMERIC(10,6),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (portfolio_id, date)
);

CREATE TABLE IF NOT EXISTS portfolio_metrics (
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  alignment_score NUMERIC(6,2),
  sector_exposure JSONB NOT NULL DEFAULT '{}'::jsonb,
  concentration JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_notes TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (portfolio_id, date)
);

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name VARCHAR(64) NOT NULL,
  run_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error TEXT,
  UNIQUE (job_name, run_date),
  CONSTRAINT chk_job_runs_status CHECK (status IN ('started', 'success', 'failed'))
);

INSERT INTO universe_symbols(symbol, name, asset_type, sector, tags)
VALUES
  ('SPY', 'SPDR S&P 500 ETF Trust', 'etf', 'broad_market', '["benchmark","equity_us"]'::jsonb),
  ('QQQ', 'Invesco QQQ Trust', 'etf', 'growth', '["benchmark","tech"]'::jsonb),
  ('IWM', 'iShares Russell 2000 ETF', 'etf', 'small_cap', '["benchmark","equity_us"]'::jsonb),
  ('XLK', 'Technology Select Sector SPDR', 'etf', 'technology', '["sector"]'::jsonb),
  ('XLE', 'Energy Select Sector SPDR', 'etf', 'energy', '["sector"]'::jsonb),
  ('XLF', 'Financial Select Sector SPDR', 'etf', 'financials', '["sector"]'::jsonb),
  ('XLI', 'Industrial Select Sector SPDR', 'etf', 'industrials', '["sector"]'::jsonb),
  ('XLV', 'Health Care Select Sector SPDR', 'etf', 'healthcare', '["sector"]'::jsonb),
  ('XLP', 'Consumer Staples Select Sector SPDR', 'etf', 'consumer_staples', '["sector"]'::jsonb),
  ('XLY', 'Consumer Discretionary Select Sector SPDR', 'etf', 'consumer_discretionary', '["sector"]'::jsonb),
  ('XLU', 'Utilities Select Sector SPDR', 'etf', 'utilities', '["sector"]'::jsonb),
  ('XLB', 'Materials Select Sector SPDR', 'etf', 'materials', '["sector"]'::jsonb),
  ('XLRE', 'Real Estate Select Sector SPDR', 'etf', 'real_estate', '["sector"]'::jsonb),
  ('XLC', 'Communication Services Select Sector SPDR', 'etf', 'communication_services', '["sector"]'::jsonb),
  ('TLT', 'iShares 20+ Year Treasury Bond ETF', 'bond', 'rates', '["rates","duration"]'::jsonb),
  ('IEF', 'iShares 7-10 Year Treasury Bond ETF', 'bond', 'rates', '["rates"]'::jsonb),
  ('HYG', 'iShares iBoxx $ High Yield Corporate Bond ETF', 'bond', 'credit', '["credit"]'::jsonb),
  ('GLD', 'SPDR Gold Shares', 'commodity', 'metals', '["commodity","defensive"]'::jsonb),
  ('USO', 'United States Oil Fund', 'commodity', 'energy', '["commodity"]'::jsonb),
  ('AAPL', 'Apple Inc.', 'equity', 'technology', '["mega_cap"]'::jsonb),
  ('MSFT', 'Microsoft Corporation', 'equity', 'technology', '["mega_cap"]'::jsonb),
  ('AMZN', 'Amazon.com, Inc.', 'equity', 'consumer_discretionary', '["mega_cap"]'::jsonb),
  ('GOOGL', 'Alphabet Inc. Class A', 'equity', 'communication_services', '["mega_cap"]'::jsonb),
  ('META', 'Meta Platforms, Inc.', 'equity', 'communication_services', '["mega_cap"]'::jsonb),
  ('NVDA', 'NVIDIA Corporation', 'equity', 'technology', '["mega_cap","ai"]'::jsonb),
  ('TSLA', 'Tesla, Inc.', 'equity', 'consumer_discretionary', '["mega_cap","ev"]'::jsonb),
  ('JPM', 'JPMorgan Chase & Co.', 'equity', 'financials', '["bank"]'::jsonb),
  ('XOM', 'Exxon Mobil Corporation', 'equity', 'energy', '["oil_gas"]'::jsonb),
  ('UNH', 'UnitedHealth Group Incorporated', 'equity', 'healthcare', '["defensive"]'::jsonb),
  ('PG', 'Procter & Gamble Company', 'equity', 'consumer_staples', '["defensive"]'::jsonb)
ON CONFLICT (symbol) DO UPDATE
SET
  name = EXCLUDED.name,
  asset_type = EXCLUDED.asset_type,
  sector = EXCLUDED.sector,
  tags = EXCLUDED.tags,
  is_active = TRUE;
