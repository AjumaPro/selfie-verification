const path = require('path');
const fs = require('fs');

/**
 * Resolve DB engine:
 * - Postgres when DB_CLIENT=postgres/pg or DATABASE_URL is a Postgres URL (default path)
 * - SQLite only when explicitly requested (device / offline): DB_CLIENT=sqlite or SQLITE_PATH
 */
function resolveDbConfig() {
  const client = String(process.env.DB_CLIENT || '').toLowerCase().trim();
  const url = String(process.env.DATABASE_URL || '').trim();
  const sqlitePathEnv = String(process.env.SQLITE_PATH || '').trim();

  const forceSqlite =
    client === 'sqlite' ||
    client === 'sqlite3' ||
    url.startsWith('sqlite:') ||
    url.startsWith('file:');

  // SQLITE_PATH alone opts into sqlite (device builds), unless postgres was requested.
  const wantSqlite =
    forceSqlite ||
    (Boolean(sqlitePathEnv) &&
      client !== 'postgres' &&
      client !== 'pg' &&
      client !== 'postgresql');

  if (wantSqlite) {
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
      'DATABASE_URL is not set. Set a Postgres DATABASE_URL (or DB_CLIENT=sqlite for local device mode).'
    );
  }

  return { engine: 'postgres', connectionString: url };
}

module.exports = { resolveDbConfig };
