BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_type_enum') THEN
    CREATE TYPE asset_type_enum AS ENUM ('equity','etf','index','crypto','fx','commodity','bond_yield_proxy');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regime_state_enum') THEN
    CREATE TYPE regime_state_enum AS ENUM ('EXPANSION','TRANSITION','STRESS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bucket_enum') THEN
    CREATE TYPE bucket_enum AS ENUM ('HIGH','MODERATE','NEUTRAL','LOW');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'direction_enum') THEN
    CREATE TYPE direction_enum AS ENUM ('UP','FLAT','DOWN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_type_enum') THEN
    CREATE TYPE alert_type_enum AS ENUM ('REGIME_CHANGE','THEME_JUMP','LEADERSHIP_SHIFT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'severity_enum') THEN
    CREATE TYPE severity_enum AS ENUM ('INFO','WARN','MAJOR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portfolio_challenge_type_enum') THEN
    CREATE TYPE portfolio_challenge_type_enum AS ENUM ('CONCENTRATION','REGIME_MISMATCH','THESIS_DETERIORATION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portfolio_challenge_severity_enum') THEN
    CREATE TYPE portfolio_challenge_severity_enum AS ENUM ('WARN','MAJOR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_module_enum') THEN
    CREATE TYPE app_module_enum AS ENUM ('IDEAS','PORTFOLIO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_role_enum') THEN
    CREATE TYPE chat_role_enum AS ENUM ('user','assistant','system');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS themes (
  theme_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  tier SMALLINT NOT NULL CHECK (tier IN (1,2,3)),
  default_universe_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  asset_id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type asset_type_enum NOT NULL,
  exchange TEXT,
  currency TEXT,
  country TEXT,
  sector TEXT,
  industry TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_theme_map (
  asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  primary_theme_id TEXT NOT NULL REFERENCES themes(theme_id),
  secondary_theme_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  theme_sensitivity NUMERIC(4,3) NOT NULL DEFAULT 0.800 CHECK (theme_sensitivity >= 0 AND theme_sensitivity <= 1),
  effective_from DATE NOT NULL,
  effective_to DATE,
  PRIMARY KEY (asset_id, effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_theme_current ON asset_theme_map(asset_id) WHERE effective_to IS NULL;

CREATE TABLE IF NOT EXISTS daily_prices (
  asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC NOT NULL,
  adj_close NUMERIC,
  volume BIGINT,
  source TEXT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset_id, date)
);

CREATE TABLE IF NOT EXISTS macro_series (
  series_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS macro_observations (
  series_id TEXT NOT NULL REFERENCES macro_series(series_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  value NUMERIC NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (series_id, date)
);

CREATE TABLE IF NOT EXISTS fundamentals_periodic (
  asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('quarter','annual','ttm')),
  period_end_date DATE NOT NULL,
  revenue NUMERIC,
  revenue_yoy_growth NUMERIC,
  gross_margin NUMERIC,
  operating_margin NUMERIC,
  ebitda_margin NUMERIC,
  pe_ttm NUMERIC,
  ev_ebitda_ttm NUMERIC,
  market_cap NUMERIC,
  source TEXT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset_id, period_type, period_end_date)
);

CREATE TABLE IF NOT EXISTS fundamentals_history_metrics (
  asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  pe_5y_avg NUMERIC,
  pe_5y_pctl NUMERIC,
  ev_ebitda_5y_avg NUMERIC,
  source TEXT NOT NULL,
  PRIMARY KEY (asset_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS daily_features_asset (
  asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  ret_1d NUMERIC, ret_1w NUMERIC, ret_1m NUMERIC, ret_3m NUMERIC,
  ma_50 NUMERIC, ma_200 NUMERIC,
  ma_trend_flag SMALLINT,
  rel_strength_vs_benchmark NUMERIC,
  volatility_20d NUMERIC,
  volume_zscore NUMERIC,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset_id, date)
);

CREATE TABLE IF NOT EXISTS daily_features_theme (
  theme_id TEXT NOT NULL REFERENCES themes(theme_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  theme_ret_1m NUMERIC, theme_ret_3m NUMERIC,
  theme_rel_strength NUMERIC, theme_volatility NUMERIC,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (theme_id, date)
);

CREATE TABLE IF NOT EXISTS daily_regime (
  date DATE PRIMARY KEY,
  regime_state regime_state_enum NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  change_risk INTEGER CHECK (change_risk BETWEEN 0 AND 100),
  narrative TEXT NOT NULL,
  numbers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_regime_signals (
  date DATE NOT NULL,
  signal_key TEXT NOT NULL CHECK (signal_key IN ('trend','breadth','vix','credit')),
  value NUMERIC,
  normalized_score INTEGER CHECK (normalized_score BETWEEN 0 AND 100),
  source_ref TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, signal_key)
);

CREATE TABLE IF NOT EXISTS daily_theme_scores (
  theme_id TEXT NOT NULL REFERENCES themes(theme_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  bucket bucket_enum NOT NULL,
  direction direction_enum NOT NULL,
  base_score INTEGER CHECK (base_score BETWEEN 0 AND 100),
  overlay_score INTEGER CHECK (overlay_score BETWEEN 0 AND 100),
  regime_multiplier NUMERIC(4,3),
  narrative TEXT NOT NULL,
  numbers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (theme_id, date)
);

CREATE TABLE IF NOT EXISTS daily_asset_scores (
  asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL REFERENCES themes(theme_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  components_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  narrative_exec TEXT NOT NULL,
  narrative_full TEXT,
  numbers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset_id, theme_id, date)
);

CREATE TABLE IF NOT EXISTS daily_theme_rankings (
  theme_id TEXT NOT NULL REFERENCES themes(theme_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 4),
  asset_id TEXT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  asset_score INTEGER NOT NULL CHECK (asset_score BETWEEN 0 AND 100),
  is_active_theme BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (theme_id, date, rank)
);

CREATE TABLE IF NOT EXISTS daily_alerts (
  alert_id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  alert_type alert_type_enum NOT NULL,
  severity severity_enum NOT NULL,
  title TEXT NOT NULL,
  narrative TEXT NOT NULL,
  numbers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_theme_id TEXT REFERENCES themes(theme_id),
  related_asset_id TEXT REFERENCES assets(asset_id),
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_alerts_date ON daily_alerts(date);

CREATE TABLE IF NOT EXISTS user_portfolios (
  portfolio_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_portfolio_positions (
  portfolio_id TEXT NOT NULL REFERENCES user_portfolios(portfolio_id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(asset_id),
  quantity NUMERIC,
  market_value NUMERIC,
  weight NUMERIC CHECK (weight >= 0 AND weight <= 1),
  source TEXT NOT NULL DEFAULT 'manual',
  PRIMARY KEY (portfolio_id, as_of_date, asset_id)
);

CREATE TABLE IF NOT EXISTS user_portfolio_exposures (
  portfolio_id TEXT NOT NULL REFERENCES user_portfolios(portfolio_id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  theme_id TEXT NOT NULL REFERENCES themes(theme_id),
  direct_exposure NUMERIC NOT NULL DEFAULT 0 CHECK (direct_exposure >= 0 AND direct_exposure <= 1),
  indirect_exposure NUMERIC NOT NULL DEFAULT 0 CHECK (indirect_exposure >= 0 AND indirect_exposure <= 1),
  total_exposure NUMERIC NOT NULL DEFAULT 0 CHECK (total_exposure >= 0 AND total_exposure <= 1),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (portfolio_id, as_of_date, theme_id)
);

CREATE TABLE IF NOT EXISTS user_behavior_metrics (
  user_id TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  window_days INTEGER NOT NULL CHECK (window_days IN (60,180)),
  max_single_asset_concentration_avg NUMERIC,
  max_theme_concentration_avg NUMERIC,
  avg_holding_period_days NUMERIC,
  avg_reaction_lag_days NUMERIC,
  warnings_ignored_count INTEGER,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, as_of_date, window_days)
);

CREATE TABLE IF NOT EXISTS portfolio_challenges (
  challenge_id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL REFERENCES user_portfolios(portfolio_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  challenge_type portfolio_challenge_type_enum NOT NULL,
  severity portfolio_challenge_severity_enum NOT NULL,
  narrative TEXT NOT NULL,
  numbers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_threads (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  module app_module_enum NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(thread_id) ON DELETE CASCADE,
  role chat_role_enum NOT NULL,
  content TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_memory_summaries (
  user_id TEXT NOT NULL,
  module app_module_enum NOT NULL,
  as_of_date DATE NOT NULL,
  window_days INTEGER NOT NULL CHECK (window_days IN (60,180)),
  summary TEXT NOT NULL,
  facts_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, module, as_of_date, window_days)
);

COMMIT;
