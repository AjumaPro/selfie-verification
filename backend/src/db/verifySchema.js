/**
 * Shared selfie-verification sessions (QR / link) + guest results.
 */
async function tryAddColumn(query, sql) {
  try {
    await query(sql);
  } catch (err) {
    const msg = String(err.message || '');
    if (!/duplicate column|already exists/i.test(msg)) {
      /* ignore */
    }
  }
}

async function ensureVerifySchema(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS verify_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Identity verification',
      host_user_id TEXT NOT NULL DEFAULT '',
      host_key TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT NOW(),
      updated_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS verify_results (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      ghana_card TEXT NOT NULL DEFAULT '',
      verified TEXT NOT NULL DEFAULT 'FALSE',
      forenames TEXT NOT NULL DEFAULT '',
      surname TEXT NOT NULL DEFAULT '',
      national_id TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      birth_date TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      transaction_guid TEXT NOT NULL DEFAULT '',
      local_face_ok INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await tryAddColumn(
    query,
    `ALTER TABLE verify_sessions ADD COLUMN note TEXT NOT NULL DEFAULT ''`
  );

  await query(
    `CREATE INDEX IF NOT EXISTS idx_verify_sessions_host ON verify_sessions (host_user_id)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_verify_results_session ON verify_results (session_id)`
  );
}

module.exports = { ensureVerifySchema };
