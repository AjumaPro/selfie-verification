const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
