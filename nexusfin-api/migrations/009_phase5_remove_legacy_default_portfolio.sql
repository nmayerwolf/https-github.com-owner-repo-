UPDATE portfolios
SET
  is_default = FALSE,
  name = 'Portfolio 1',
  updated_at = NOW()
WHERE is_default = TRUE
  AND deleted_at IS NULL
  AND (name = 'Portfolio principal' OR name IS NULL OR BTRIM(name) = '');
