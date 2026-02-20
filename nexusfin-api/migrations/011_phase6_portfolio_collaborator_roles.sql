ALTER TABLE portfolio_collaborators
  ADD COLUMN IF NOT EXISTS role VARCHAR(10) NOT NULL DEFAULT 'editor';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_portfolio_collaborator_role'
  ) THEN
    ALTER TABLE portfolio_collaborators
      ADD CONSTRAINT chk_portfolio_collaborator_role
      CHECK (role IN ('viewer', 'editor'));
  END IF;
END $$;
