const fs = require('fs');
const path = require('path');

describe('task2 migration', () => {
  test('declares recommendations + digest additions', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '021_horsai_recommendations_digest_task2.sql'),
      'utf8'
    );

    expect(sql).toContain('ALTER TABLE IF EXISTS fundamentals_snapshot');
    expect(sql).toContain('ALTER TABLE IF EXISTS news_items');
    expect(sql).toContain('ALTER TABLE IF EXISTS daily_digest');
    expect(sql).toContain('ALTER TABLE IF EXISTS base_ideas');
    expect(sql).toContain('ALTER TABLE IF EXISTS user_recommendations');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ai_usage_log');
  });
});
