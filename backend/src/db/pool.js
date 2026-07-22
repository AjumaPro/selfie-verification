const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env');
}

/**
 * Managed Postgres (Neon, DigitalOcean, etc.) often presents certs Node does not trust.
 * Newer `pg` also maps sslmode=require → verify-full, which causes:
 *   "self-signed certificate in certificate chain"
 * Use libpq-compatible require + rejectUnauthorized: false unless explicitly strict.
 */
function buildPoolConfig(url) {
  const strict =
    String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() ===
    'true';

  let connectionStringOut = url;
  const needsSsl =
    /sslmode=/i.test(url) ||
    /neon\.tech/i.test(url) ||
    /digitalocean\.com/i.test(url) ||
    /ondigitalocean\.com/i.test(url) ||
    /db\.ondigitalocean\.com/i.test(url) ||
    process.env.NODE_ENV === 'production';

  if (needsSsl && !/uselibpqcompat=/i.test(connectionStringOut)) {
    connectionStringOut += connectionStringOut.includes('?') ? '&' : '?';
    connectionStringOut += 'uselibpqcompat=true';
  }

  if (needsSsl && !/sslmode=/i.test(url)) {
    connectionStringOut += connectionStringOut.includes('?') ? '&' : '?';
    connectionStringOut += 'sslmode=require';
  }

  return {
    connectionString: connectionStringOut,
    ssl: needsSsl ? { rejectUnauthorized: strict } : undefined,
  };
}

const pool = new Pool(buildPoolConfig(connectionString));

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
