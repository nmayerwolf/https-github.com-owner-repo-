CREATE TABLE IF NOT EXISTS horsai_portfolio_scores_daily (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  market_alignment NUMERIC(6,2) NOT NULL CHECK (market_alignment >= 0 AND market_alignment <= 100),
  personal_consistency NUMERIC(6,2) NOT NULL CHECK (personal_consistency >= 0 AND personal_consistency <= 100),
  score_total NUMERIC(6,2) NOT NULL CHECK (score_total >= 0 AND score_total <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, portfolio_id, date)
);

CREATE INDEX IF NOT EXISTS idx_horsai_portfolio_scores_portfolio_date
  ON horsai_portfolio_scores_daily (portfolio_id, date DESC);

CREATE TABLE IF NOT EXISTS horsai_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  score NUMERIC(6,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  suggestion_level SMALLINT NOT NULL CHECK (suggestion_level IN (1,2,3)),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  regime VARCHAR(24) NOT NULL CHECK (regime IN ('risk_on', 'risk_off', 'transition')),
  volatility_regime VARCHAR(24) NOT NULL CHECK (volatility_regime IN ('normal', 'elevated', 'crisis')),
  diagnosis TEXT NOT NULL,
  risk_impact TEXT NOT NULL,
  adjustment JSONB NOT NULL DEFAULT '{}'::jsonb,
  specific_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_action VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (user_action IN ('pending', 'acknowledged', 'dismissed')),
  dismiss_streak INTEGER NOT NULL DEFAULT 0 CHECK (dismiss_streak >= 0),
  consecutive_display_days INTEGER NOT NULL DEFAULT 1 CHECK (consecutive_display_days >= 1),
  cooldown_until DATE,
  last_action_at TIMESTAMPTZ,
  reactivated_at TIMESTAMPTZ,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_horsai_signals_user_shown
  ON horsai_signals (user_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS idx_horsai_signals_portfolio_shown
  ON horsai_signals (portfolio_id, shown_at DESC);

CREATE TABLE IF NOT EXISTS horsai_signal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES horsai_signals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  evaluated_at DATE NOT NULL,
  eval_window_days INTEGER NOT NULL CHECK (eval_window_days BETWEEN 7 AND 14),
  delta_return NUMERIC(12,6) NOT NULL,
  delta_volatility NUMERIC(12,6) NOT NULL,
  delta_drawdown NUMERIC(12,6) NOT NULL,
  rai NUMERIC(12,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (signal_id, evaluated_at)
);

CREATE INDEX IF NOT EXISTS idx_horsai_signal_outcomes_portfolio_eval
  ON horsai_signal_outcomes (portfolio_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_horsai_signal_outcomes_user_eval
  ON horsai_signal_outcomes (user_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS horsai_user_conviction_policy (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rai_mean_20 NUMERIC(12,6) NOT NULL DEFAULT 0,
  confidence_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.75 CHECK (confidence_threshold >= 0.5 AND confidence_threshold <= 0.95),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
