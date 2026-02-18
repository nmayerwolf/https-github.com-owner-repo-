CREATE TABLE IF NOT EXISTS portfolio_collaborators (
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (portfolio_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_collaborators_user ON portfolio_collaborators(user_id);

CREATE TABLE IF NOT EXISTS portfolio_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  invited_email VARCHAR(255) NOT NULL,
  invited_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT chk_portfolio_invite_status CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_portfolio_invites_email ON portfolio_invitations(invited_email, status);
CREATE INDEX IF NOT EXISTS idx_portfolio_invites_user ON portfolio_invitations(invited_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_portfolio_pending_invite
  ON portfolio_invitations(portfolio_id, invited_email)
  WHERE status = 'pending';
