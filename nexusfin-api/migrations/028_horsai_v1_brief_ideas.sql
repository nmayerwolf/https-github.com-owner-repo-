CREATE TABLE IF NOT EXISTS horsai_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNDER_REVIEW'
    CHECK (status IN ('ACTIVE', 'UNDER_REVIEW', 'CLOSED')),
  horizon TEXT NOT NULL DEFAULT 'ONE_TO_THREE_MONTHS'
    CHECK (horizon IN ('EVENT_DRIVEN', 'ONE_TO_THREE_MONTHS')),
  thesis TEXT NOT NULL,
  fundamentals TEXT NOT NULL,
  catalyst TEXT NOT NULL,
  dislocation TEXT NOT NULL,
  risks TEXT NOT NULL,
  conviction_total NUMERIC(3,1) NOT NULL CHECK (conviction_total >= 1.0 AND conviction_total <= 5.0),
  conviction_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  high_conviction BOOLEAN NOT NULL DEFAULT FALSE,
  last_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_visible_update_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_horsai_ideas_user_visibility
  ON horsai_ideas (user_id, last_visible_update_at DESC);

CREATE INDEX IF NOT EXISTS idx_horsai_ideas_user_status_visibility
  ON horsai_ideas (user_id, status, last_visible_update_at DESC);

CREATE TABLE IF NOT EXISTS horsai_idea_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_prompt TEXT NOT NULL,
  agent_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  produced_idea_id UUID NULL REFERENCES horsai_ideas(id) ON DELETE SET NULL,
  conviction_total NUMERIC(3,1) NOT NULL CHECK (conviction_total >= 1.0 AND conviction_total <= 5.0),
  qualifies_active BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_horsai_idea_interactions_user_created
  ON horsai_idea_interactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS horsai_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  main_paragraph TEXT NOT NULL,
  bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlighted_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  qa_flags JSONB NULL,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_horsai_briefs_user_date
  ON horsai_briefs (user_id, date DESC);
