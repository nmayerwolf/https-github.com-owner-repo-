const { Pool } = require('pg');
const { env } = require('./env');

const pool = new Pool({ connectionString: env.databaseUrl });

const query = (text, params = []) => pool.query(text, params);

module.exports = { pool, query };
