const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

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
      await pool.query(sql);
      console.log(`Migration completed: ${file}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Migration failed', error);
    process.exit(1);
  }
};

run();
