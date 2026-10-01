const crypto = require('crypto');
const Database = require('better-sqlite3');

/**
 * better-sqlite3 wrapper with pg-compatible query() shape: { rows, rowCount }
 * Supports $1-style params and NOW().
 */
function createSqlitePool(sqlitePath) {
  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    db.function('gen_uuid', () => crypto.randomUUID());
  } catch {
    // already registered on hot reload
  }

  function adaptSql(text) {
    // Parentheses required for function defaults in SQLite
    return String(text).replace(/\bNOW\(\)/gi, "(datetime('now'))");
  }

  function toSqlite(text, params = []) {
    const sql = adaptSql(text);
    const values = [];
    const out = sql.replace(/\$(\d+)/g, (_, n) => {
      values.push(params[Number(n) - 1]);
      return '?';
    });
    return { sql: out, values };
  }

  function query(text, params = []) {
    const { sql, values } = toSqlite(text, params);
    const trimmed = sql.trim();
    const stmt = db.prepare(sql);

    const isSelect = /^(select|with)\b/i.test(trimmed);
    const hasReturning = /\breturning\b/i.test(trimmed);

    if (isSelect || hasReturning) {
      const rows = stmt.all(...values);
      return Promise.resolve({ rows, rowCount: rows.length });
    }

    const info = stmt.run(...values);
    return Promise.resolve({ rows: [], rowCount: info.changes });
  }

  const api = {
    query,
    connect: async () => ({
      query,
      release() {},
    }),
    end: async () => {
      db.close();
    },
    on() {},
  };

  console.log(`SQLite ready: ${sqlitePath}`);
  return api;
}

module.exports = { createSqlitePool };
