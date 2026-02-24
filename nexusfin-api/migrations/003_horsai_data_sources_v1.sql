BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$ BEGIN
  CREATE TYPE asset_class AS ENUM ('equity','etf','index','crypto','fx');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE source_vendor AS ENUM ('polygon','fmp','newsapi','gdelt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE earnings_tod AS ENUM ('BMO','AMC','DMT','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_kind text NOT NULL DEFAULT 'daily',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  error_message text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS runs_started_at_idx ON runs (started_at DESC);

CREATE TABLE IF NOT EXISTS asset_source_map (
  map_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  vendor source_vendor NOT NULL,
  vendor_symbol text NOT NULL,
  vendor_id text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor, vendor_symbol),
  UNIQUE (asset_id, vendor, vendor_symbol)
);

CREATE INDEX IF NOT EXISTS asset_source_map_asset_idx ON asset_source_map (asset_id);

CREATE TABLE IF NOT EXISTS market_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  ts timestamptz NOT NULL,
  last numeric(20,8) NOT NULL,
  change_abs numeric(20,8),
  change_pct numeric(10,6),
  day_high numeric(20,8),
  day_low numeric(20,8),
  volume numeric(24,4),
  currency text NOT NULL DEFAULT 'USD',
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, asset_id)
);

CREATE INDEX IF NOT EXISTS market_snapshots_run_asset_idx ON market_snapshots (run_id, asset_id);
CREATE INDEX IF NOT EXISTS market_snapshots_ts_idx ON market_snapshots (ts DESC);

CREATE TABLE IF NOT EXISTS price_bars (
  bar_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  interval text NOT NULL,
  ts timestamptz NOT NULL,
  open numeric(20,8) NOT NULL,
  high numeric(20,8) NOT NULL,
  low numeric(20,8) NOT NULL,
  close numeric(20,8) NOT NULL,
  volume numeric(24,4),
  currency text NOT NULL DEFAULT 'USD',
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, interval, ts)
);

CREATE INDEX IF NOT EXISTS price_bars_asset_interval_ts_idx
  ON price_bars (asset_id, interval, ts DESC);

CREATE TABLE IF NOT EXISTS fundamentals (
  fundamentals_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  as_of timestamptz NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  market_cap numeric(24,2),
  revenue_ttm numeric(24,2),
  gross_margin_ttm numeric(10,6),
  operating_margin_ttm numeric(10,6),
  net_margin_ttm numeric(10,6),
  fcf_ttm numeric(24,2),
  net_debt numeric(24,2),
  debt_to_ebitda numeric(10,6),
  pe_ttm numeric(20,6),
  ev_to_ebitda_ttm numeric(20,6),
  price_to_sales_ttm numeric(20,6),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, as_of)
);

CREATE INDEX IF NOT EXISTS fundamentals_asset_asof_idx
  ON fundamentals (asset_id, as_of DESC);

CREATE TABLE IF NOT EXISTS earnings_events (
  earnings_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  fiscal_period text,
  report_date timestamptz NOT NULL,
  time_of_day earnings_tod NOT NULL DEFAULT 'UNKNOWN',
  eps_estimate numeric(20,6),
  revenue_estimate numeric(24,2),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, report_date)
);

CREATE INDEX IF NOT EXISTS earnings_events_report_date_idx
  ON earnings_events (report_date);
CREATE INDEX IF NOT EXISTS earnings_events_asset_date_idx
  ON earnings_events (asset_id, report_date DESC);

CREATE TABLE IF NOT EXISTS news_items (
  news_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  published_at timestamptz NOT NULL,
  title text NOT NULL,
  description text,
  source_name text,
  url text NOT NULL,
  url_hash bytea NOT NULL,
  image_url text,
  language text,
  relevance_score numeric(10,6),
  related_assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (url_hash)
);

ALTER TABLE news_items ADD COLUMN IF NOT EXISTS news_id uuid DEFAULT gen_random_uuid();
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS url_hash bytea;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS relevance_score numeric(10,6);
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS related_assets jsonb DEFAULT '[]'::jsonb;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS sources jsonb DEFAULT '[]'::jsonb;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE news_items SET news_id = gen_random_uuid() WHERE news_id IS NULL;
UPDATE news_items SET published_at = now() WHERE published_at IS NULL;
UPDATE news_items SET title = coalesce(title, 'Untitled') WHERE title IS NULL;
UPDATE news_items SET url = coalesce(url, md5(random()::text)) WHERE url IS NULL;
UPDATE news_items SET related_assets = '[]'::jsonb WHERE related_assets IS NULL;
UPDATE news_items SET sources = '[]'::jsonb WHERE sources IS NULL;
UPDATE news_items SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE news_items ALTER COLUMN news_id SET NOT NULL;
ALTER TABLE news_items ALTER COLUMN published_at SET NOT NULL;
ALTER TABLE news_items ALTER COLUMN title SET NOT NULL;
ALTER TABLE news_items ALTER COLUMN url SET NOT NULL;
ALTER TABLE news_items ALTER COLUMN related_assets SET NOT NULL;
ALTER TABLE news_items ALTER COLUMN sources SET NOT NULL;
ALTER TABLE news_items ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS news_items_published_at_idx
  ON news_items (published_at DESC);
CREATE INDEX IF NOT EXISTS news_items_relevance_idx
  ON news_items (relevance_score DESC);

CREATE OR REPLACE FUNCTION set_news_url_hash()
RETURNS trigger AS $$
BEGIN
  NEW.url_hash := digest(coalesce(NEW.url,''), 'sha256');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE news_items
SET url_hash = digest(coalesce(url, ''), 'sha256')
WHERE url_hash IS NULL;

DELETE FROM news_items a
USING news_items b
WHERE a.ctid < b.ctid
  AND a.url_hash = b.url_hash;

CREATE UNIQUE INDEX IF NOT EXISTS news_items_url_hash_uidx
  ON news_items (url_hash);

DROP TRIGGER IF EXISTS trg_set_news_url_hash ON news_items;
CREATE TRIGGER trg_set_news_url_hash
BEFORE INSERT OR UPDATE OF url ON news_items
FOR EACH ROW
EXECUTE FUNCTION set_news_url_hash();

CREATE TABLE IF NOT EXISTS brief_bullets (
  brief_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  headline text NOT NULL,
  why_it_matters text NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  market_context jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS brief_bullets_run_idx ON brief_bullets (run_id);
CREATE INDEX IF NOT EXISTS brief_bullets_created_at_idx ON brief_bullets (created_at DESC);

COMMIT;
