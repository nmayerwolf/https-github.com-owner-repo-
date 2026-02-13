const { query } = require('../config/db');

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomCode = () => {
  let out = 'NXF-';
  for (let i = 0; i < 5; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
};

const generateUniqueGroupCode = async () => {
  for (let i = 0; i < 25; i += 1) {
    const code = randomCode();
    const exists = await query('SELECT 1 FROM groups WHERE code = $1', [code]);
    if (!exists.rows.length) return code;
  }
  throw new Error('Could not generate unique group code');
};

module.exports = { generateUniqueGroupCode };
