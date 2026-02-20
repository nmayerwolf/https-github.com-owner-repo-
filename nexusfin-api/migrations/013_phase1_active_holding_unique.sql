CREATE UNIQUE INDEX IF NOT EXISTS uniq_positions_active_portfolio_symbol
  ON positions (portfolio_id, symbol)
  WHERE sell_date IS NULL AND deleted_at IS NULL;
