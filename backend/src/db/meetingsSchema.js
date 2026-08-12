/**
 * Meeting + attendance tables (Postgres + SQLite via shared pool).
 * Use NOW() — SQLite wrapper rewrites to (datetime('now')).
 */
async function tryAddColumn(query, sql) {
  try {
    await query(sql);
  } catch (err) {
    const msg = String(err.message || '');
    if (!/duplicate column|already exists/i.test(msg)) {
      // ignore — CREATE covers fresh installs
    }
  }
}

async function ensureMeetingsSchema(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      meet_date TEXT NOT NULL,
      meet_time TEXT NOT NULL DEFAULT '09:00',
      duration_mins INTEGER NOT NULL DEFAULT 60,
      location TEXT NOT NULL DEFAULT '',
      online_link TEXT NOT NULL DEFAULT '',
      google_place TEXT NOT NULL DEFAULT '',
      venue_lat TEXT NOT NULL DEFAULT '',
      venue_lng TEXT NOT NULL DEFAULT '',
      venue_radius_m INTEGER NOT NULL DEFAULT 200,
      is_in_person INTEGER NOT NULL DEFAULT 1,
      organiser TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'scheduled',
      agenda TEXT NOT NULL DEFAULT '',
      meal_menu_json TEXT NOT NULL DEFAULT '{}',
      program_schedule_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT NOW(),
      updated_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS meeting_attendance (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      latitude TEXT NOT NULL DEFAULT '',
      longitude TEXT NOT NULL DEFAULT '',
      location_accuracy TEXT NOT NULL DEFAULT '',
      location_match TEXT NOT NULL DEFAULT 'unknown',
      distance_m TEXT NOT NULL DEFAULT '',
      consent_details INTEGER NOT NULL DEFAULT 0,
      consent_location INTEGER NOT NULL DEFAULT 0,
      breakfast_choice TEXT NOT NULL DEFAULT '',
      lunch_choice TEXT NOT NULL DEFAULT '',
      dinner_choice TEXT NOT NULL DEFAULT '',
      checked_in_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await tryAddColumn(
    query,
    `ALTER TABLE meetings ADD COLUMN meal_menu_json TEXT NOT NULL DEFAULT '{}'`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meetings ADD COLUMN program_schedule_json TEXT NOT NULL DEFAULT '{}'`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meetings ADD COLUMN venue_lat TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meetings ADD COLUMN venue_lng TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meetings ADD COLUMN venue_radius_m INTEGER NOT NULL DEFAULT 200`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meetings ADD COLUMN is_in_person INTEGER NOT NULL DEFAULT 1`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meetings ADD COLUMN host_key TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meetings ADD COLUMN host_payload_json TEXT NOT NULL DEFAULT '{}'`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meeting_attendance ADD COLUMN latitude TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meeting_attendance ADD COLUMN longitude TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meeting_attendance ADD COLUMN location_accuracy TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meeting_attendance ADD COLUMN location_match TEXT NOT NULL DEFAULT 'unknown'`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meeting_attendance ADD COLUMN distance_m TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meeting_attendance ADD COLUMN consent_details INTEGER NOT NULL DEFAULT 0`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meeting_attendance ADD COLUMN consent_location INTEGER NOT NULL DEFAULT 0`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meeting_attendance ADD COLUMN breakfast_choice TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meeting_attendance ADD COLUMN lunch_choice TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE meeting_attendance ADD COLUMN dinner_choice TEXT NOT NULL DEFAULT ''`
  );

  await query(
    `CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting ON meeting_attendance (meeting_id)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_meeting_attendance_email ON meeting_attendance (meeting_id, email)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings (meet_date)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_meetings_host_key ON meetings (host_key)`
  );
}

module.exports = { ensureMeetingsSchema };
