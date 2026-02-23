BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_run_status') THEN
    CREATE TYPE agent_run_status AS ENUM ('queued','running','succeeded','failed','canceled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'package_kind') THEN
    CREATE TYPE package_kind AS ENUM ('ideas_daily','brief_daily','portfolio_daily');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'idea_action') THEN
    CREATE TYPE idea_action AS ENUM ('buy','sell','hold','short','avoid','watch');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'idea_horizon') THEN
    CREATE TYPE idea_horizon AS ENUM ('days','weeks','months','quarters','years');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'idea_status') THEN
    CREATE TYPE idea_status AS ENUM ('draft','active','monitoring','closed','invalidated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'instrument_kind') THEN
    CREATE TYPE instrument_kind AS ENUM ('equity','etf','option','future','fx','crypto','bond','fund');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
    CREATE TYPE risk_level AS ENUM ('low','medium','high','very_high');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_kind') THEN
    CREATE TYPE source_kind AS ENUM ('news','filing','earnings_call','macro_data','price_action','research','social','other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_role') THEN
    CREATE TYPE chat_role AS ENUM ('system','assistant','user','tool');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'holding_side') THEN
    CREATE TYPE holding_side AS ENUM ('long','short');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'txn_type') THEN
    CREATE TYPE txn_type AS ENUM ('buy','sell','dividend','interest','fee','deposit','withdrawal','split','transfer');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'plus',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users_ext (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  locale TEXT NOT NULL DEFAULT 'es-AR',
  timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_users_ext_tenant_email UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS assets_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  kind instrument_kind NOT NULL,
  exchange TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  country TEXT,
  sector TEXT,
  industry TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_assets_v2_symbol_kind UNIQUE(symbol, kind)
);

CREATE TABLE IF NOT EXISTS themes_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_themes_v2_tenant_name UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user UUID REFERENCES users_ext(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  action idea_action NOT NULL,
  horizon idea_horizon NOT NULL DEFAULT 'months',
  horizon_value INTEGER NOT NULL DEFAULT 3,
  status idea_status NOT NULL DEFAULT 'active',
  risk risk_level NOT NULL DEFAULT 'medium',
  conviction_score NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  quality_score NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  freshness_score NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  thesis JSONB NOT NULL DEFAULT '{}'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  catalysts JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  valuation JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idea_themes (
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES themes_v2(id) ON DELETE CASCADE,
  PRIMARY KEY (idea_id, theme_id)
);

CREATE TABLE IF NOT EXISTS idea_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets_v2(id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  direction holding_side NOT NULL DEFAULT 'long',
  weight_hint_bp INTEGER,
  entry JSONB NOT NULL DEFAULT '{}'::jsonb,
  exits JSONB NOT NULL DEFAULT '{}'::jsonb,
  sizing JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind source_kind NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT,
  url TEXT,
  published_at TIMESTAMPTZ,
  extracted_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idea_sources (
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  relevance NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  note TEXT,
  PRIMARY KEY (idea_id, source_id)
);

CREATE TABLE IF NOT EXISTS daily_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users_ext(id) ON DELETE SET NULL,
  kind package_kind NOT NULL DEFAULT 'ideas_daily',
  as_of_date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT NOT NULL,
  intro TEXT,
  market_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_daily_packages UNIQUE (tenant_id, user_id, kind, as_of_date)
);

CREATE TABLE IF NOT EXISTS daily_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES daily_packages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_package_position UNIQUE(package_id, position)
);

CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users_ext(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Main',
  base_currency TEXT NOT NULL DEFAULT 'USD',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_portfolios UNIQUE (tenant_id, user_id, name)
);

CREATE TABLE IF NOT EXISTS holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets_v2(id) ON DELETE RESTRICT,
  side holding_side NOT NULL DEFAULT 'long',
  quantity NUMERIC(28,10) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(28,10),
  currency TEXT NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_holdings UNIQUE (portfolio_id, asset_id, side)
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES assets_v2(id) ON DELETE RESTRICT,
  type txn_type NOT NULL,
  side holding_side,
  quantity NUMERIC(28,10),
  price NUMERIC(28,10),
  fees NUMERIC(28,10) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  occurred_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users_ext(id) ON DELETE SET NULL,
  kind package_kind NOT NULL,
  status agent_run_status NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  model TEXT,
  prompt_version TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  input_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users_ext(id) ON DELETE SET NULL,
  topic TEXT NOT NULL DEFAULT 'ideas',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role chat_role NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users_ext(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Watchlist',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_watchlists UNIQUE(tenant_id, user_id, name)
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets_v2(id) ON DELETE RESTRICT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (watchlist_id, asset_id)
);

COMMIT;
