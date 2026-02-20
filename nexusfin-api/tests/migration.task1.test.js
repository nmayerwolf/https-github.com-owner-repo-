const fs = require('fs');
const path = require('path');

describe('task1 migration', () => {
  test('declares required tables and universe seed', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '020_horsai_schema_engines_task1.sql'),
      'utf8'
    );

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS universe_symbols');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS market_daily_bars');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS market_metrics_daily');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS regime_state');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS crisis_state');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS user_agent_profile');

    const universeRows = (sql.match(/\('[^']+','[^']+','(equity|etf|bond|metal|commodity|crypto|fx)'/g) || []).length;
    expect(universeRows).toBeGreaterThanOrEqual(98);
  });
});
