/**
 * Teachers’ Provident Fund Scheme (Tier-3) membership registration forms.
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

async function ensureMembershipSchema(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS membership_forms (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL DEFAULT '',
      staff_id TEXT NOT NULL DEFAULT '',
      school_name TEXT NOT NULL DEFAULT '',
      district_region TEXT NOT NULL DEFAULT '',
      union_affiliation TEXT NOT NULL DEFAULT '',
      date_of_employment TEXT NOT NULL DEFAULT '',
      first_deduction TEXT NOT NULL DEFAULT '',
      surname TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      other_names TEXT NOT NULL DEFAULT '',
      date_of_birth TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      birth_town TEXT NOT NULL DEFAULT '',
      birth_region TEXT NOT NULL DEFAULT '',
      birth_country TEXT NOT NULL DEFAULT '',
      ghana_card TEXT NOT NULL DEFAULT '',
      residential_address TEXT NOT NULL DEFAULT '',
      postal_address TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      mobile TEXT NOT NULL DEFAULT '',
      contribution_rate TEXT NOT NULL DEFAULT '',
      contribution_other TEXT NOT NULL DEFAULT '',
      basic_salary TEXT NOT NULL DEFAULT '',
      ssnit_number TEXT NOT NULL DEFAULT '',
      beneficiaries_json TEXT NOT NULL DEFAULT '[]',
      declaration_date TEXT NOT NULL DEFAULT '',
      photo_data TEXT NOT NULL DEFAULT '',
      signature_data TEXT NOT NULL DEFAULT '',
      form_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT NOW(),
      updated_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await tryAddColumn(
    query,
    `ALTER TABLE membership_forms ADD COLUMN created_by TEXT NOT NULL DEFAULT ''`
  );

  await query(
    `CREATE INDEX IF NOT EXISTS idx_membership_created_by ON membership_forms (created_by)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_membership_created_at ON membership_forms (created_at)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_membership_staff ON membership_forms (staff_id)`
  );
}

module.exports = { ensureMembershipSchema };
