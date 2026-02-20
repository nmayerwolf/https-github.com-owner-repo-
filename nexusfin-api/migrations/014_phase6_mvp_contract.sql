ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS currency VARCHAR(8) NOT NULL DEFAULT 'USD';

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS source VARCHAR(12) NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_positions_source'
  ) THEN
    ALTER TABLE positions
      ADD CONSTRAINT chk_positions_source CHECK (source IN ('manual', 'reco'));
  END IF;
END $$;

ALTER TABLE portfolio_invitations
  ADD COLUMN IF NOT EXISTS role VARCHAR(10) NOT NULL DEFAULT 'editor';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_portfolio_invitation_role'
  ) THEN
    ALTER TABLE portfolio_invitations
      ADD CONSTRAINT chk_portfolio_invitation_role CHECK (role IN ('viewer', 'editor'));
  END IF;
END $$;
