const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

const run = async () => {
  const file = path.join(__dirname, '001_initial.sql');
  const sql = fs.readFileSync(file, 'utf8');

  try {
    await pool.query(sql);
    console.log('Migration completed: 001_initial.sql');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed', error);
    process.exit(1);
  }
};

run();
