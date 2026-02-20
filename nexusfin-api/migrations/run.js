const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

const AI_USAGE_LOG_BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  symbol TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage_log(created_at);
`;

const migrationFiles = () =>
  fs
    .readdirSync(__dirname)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

const run = async () => {
  const files = migrationFiles();

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
      try {
        await pool.query(sql);
        console.log(`Migration completed: ${file}`);
      } catch (error) {
        const missingAiUsageLog =
          String(error?.code || '') === '42P01' && /ai_usage_log/i.test(String(error?.message || ''));
        if (!missingAiUsageLog) {
          throw error;
        }
        console.warn(`Migration ${file} references ai_usage_log before creation. Bootstrapping ai_usage_log and retrying...`);
        await pool.query(AI_USAGE_LOG_BOOTSTRAP_SQL);
        await pool.query(sql);
        console.log(`Migration completed after ai_usage_log bootstrap: ${file}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Migration failed', error);
    process.exit(1);
  }
};

run();
