ALTER TABLE IF EXISTS horsai_signal_outcomes
  ADD COLUMN IF NOT EXISTS portfolio_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS horsai_signal_outcomes
  ADD COLUMN IF NOT EXISTS simulated_adjustment JSONB NOT NULL DEFAULT '{}'::jsonb;
