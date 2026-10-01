const { Pool } = require('pg');
const { resolveDbConfig } = require('./config');

const config = resolveDbConfig();

/**
 * Managed Postgres (DigitalOcean, etc.) often presents certs Node does not trust.
 * Newer `pg` also maps sslmode=require → verify-full, which causes:
 *   "self-signed certificate in certificate chain"
 * Use libpq-compatible require + rejectUnauthorized: false unless explicitly strict.
 */
function buildPostgresPoolConfig(url) {
  const strict =
    String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() ===
    'true';

  let connectionStringOut = url;
  const needsSsl =
    /sslmode=/i.test(url) ||
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

let pool;

if (config.engine === 'sqlite') {
  const { createSqlitePool } = require('./sqlite');
  pool = createSqlitePool(config.sqlitePath);
} else {
  pool = new Pool(buildPostgresPoolConfig(config.connectionString));
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });
  console.log('PostgreSQL pool ready');
}

module.exports = {
  engine: config.engine,
  pool,
  query: (text, params) => pool.query(text, params),
};
