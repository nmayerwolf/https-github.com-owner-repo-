CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_portfolio_default_per_user ON portfolios(user_id) WHERE is_default = TRUE AND deleted_at IS NULL;

ALTER TABLE positions ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) ON DELETE RESTRICT;

INSERT INTO portfolios (user_id, name, is_default)
SELECT DISTINCT p.user_id, 'Portfolio principal', TRUE
FROM positions p
LEFT JOIN portfolios pf
  ON pf.user_id = p.user_id
  AND pf.is_default = TRUE
  AND pf.deleted_at IS NULL
WHERE pf.id IS NULL;

UPDATE positions p
SET portfolio_id = pf.id
FROM portfolios pf
WHERE p.user_id = pf.user_id
  AND pf.is_default = TRUE
  AND pf.deleted_at IS NULL
  AND p.portfolio_id IS NULL;

ALTER TABLE positions ALTER COLUMN portfolio_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_positions_user_portfolio ON positions(user_id, portfolio_id) WHERE deleted_at IS NULL;
