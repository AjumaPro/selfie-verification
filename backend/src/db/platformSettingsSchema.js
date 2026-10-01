async function ensurePlatformSettingsSchema(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT NOW()
    )
  `);
}

module.exports = { ensurePlatformSettingsSchema };
