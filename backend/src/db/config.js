const path = require('path');
const fs = require('fs');

/**
 * Resolve DB engine:
 * - production / DigitalOcean: Postgres via DATABASE_URL
 * - local / device: SQLite file (default when DB_CLIENT=sqlite or no DATABASE_URL)
 */
function resolveDbConfig() {
  const client = String(process.env.DB_CLIENT || '').toLowerCase().trim();
  const url = String(process.env.DATABASE_URL || '').trim();
  const sqlitePathEnv = String(process.env.SQLITE_PATH || '').trim();

  const forceSqlite =
    client === 'sqlite' ||
    client === 'sqlite3' ||
    url.startsWith('sqlite:') ||
    url.startsWith('file:') ||
    Boolean(sqlitePathEnv);

  if (forceSqlite || (!url && process.env.NODE_ENV !== 'production')) {
    let filePath = sqlitePathEnv;
    if (!filePath && (url.startsWith('sqlite:') || url.startsWith('file:'))) {
      filePath = url.replace(/^sqlite(3)?:/, '').replace(/^file:/, '');
    }
    if (!filePath) {
      filePath = path.join(__dirname, '..', '..', 'data', 'auth.db');
    }
    if (!path.isAbsolute(filePath)) {
      filePath = path.resolve(process.cwd(), filePath);
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    return { engine: 'sqlite', sqlitePath: filePath };
  }

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. For local/device use DB_CLIENT=sqlite, or set a Postgres DATABASE_URL.'
    );
  }

  return { engine: 'postgres', connectionString: url };
}

module.exports = { resolveDbConfig };
