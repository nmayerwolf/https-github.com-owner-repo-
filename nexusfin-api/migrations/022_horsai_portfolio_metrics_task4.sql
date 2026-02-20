ALTER TABLE IF EXISTS portfolio_snapshots
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS snapshot_date DATE,
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pnl_absolute NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pnl_pct NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holdings_detail JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ DEFAULT NOW();

UPDATE portfolio_snapshots
SET
  snapshot_date = COALESCE(snapshot_date, date),
  total_value = COALESCE(total_value, 0),
  total_cost = COALESCE(total_cost, 0),
  pnl_absolute = COALESCE(pnl_absolute, pnl_total, 0),
  pnl_pct = CASE
    WHEN COALESCE(total_cost, 0) > 0 THEN ROUND(((COALESCE(total_value, 0) - COALESCE(total_cost, 0)) / COALESCE(total_cost, 0)) * 100, 6)
    ELSE 0
  END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_portfolio_snapshot_date_unique
  ON portfolio_snapshots(portfolio_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_ps_portfolio_date
  ON portfolio_snapshots(portfolio_id, snapshot_date DESC);

ALTER TABLE IF EXISTS portfolio_metrics
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS metric_date DATE,
  ADD COLUMN IF NOT EXISTS benchmark_symbol TEXT DEFAULT 'SPY',
  ADD COLUMN IF NOT EXISTS benchmark_pnl_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS portfolio_pnl_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS alpha NUMERIC,
  ADD COLUMN IF NOT EXISTS volatility_20d NUMERIC,
  ADD COLUMN IF NOT EXISTS category_exposure JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS concentration_top3_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ DEFAULT NOW();

UPDATE portfolio_metrics
SET metric_date = COALESCE(metric_date, date);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'portfolio_metrics'
      AND column_name = 'alignment_score'
      AND data_type <> 'integer'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE portfolio_metrics
      ALTER COLUMN alignment_score TYPE INTEGER
      USING LEAST(100, GREATEST(0, ROUND(COALESCE(alignment_score, 50))::int))
    $sql$;
  END IF;
END $$;

ALTER TABLE IF EXISTS portfolio_metrics
  DROP CONSTRAINT IF EXISTS portfolio_metrics_alignment_score_check;
ALTER TABLE IF EXISTS portfolio_metrics
  ADD CONSTRAINT portfolio_metrics_alignment_score_check CHECK (alignment_score BETWEEN 0 AND 100);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'portfolio_metrics'
      AND column_name = 'ai_notes'
      AND data_type <> 'jsonb'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE portfolio_metrics
      ALTER COLUMN ai_notes TYPE JSONB
      USING CASE
        WHEN ai_notes IS NULL OR BTRIM(ai_notes) = '' THEN '[]'::jsonb
        WHEN LEFT(BTRIM(ai_notes), 1) = '[' THEN ai_notes::jsonb
        ELSE TO_JSONB(ARRAY[ai_notes])
      END
    $sql$;
  END IF;
END $$;

ALTER TABLE IF EXISTS portfolio_metrics
  ALTER COLUMN ai_notes SET DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_portfolio_metric_date_unique
  ON portfolio_metrics(portfolio_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_pm_portfolio_date
  ON portfolio_metrics(portfolio_id, metric_date DESC);
