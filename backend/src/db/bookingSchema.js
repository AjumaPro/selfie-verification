/**
 * Calendly-style booking pages + appointments (Postgres / SQLite).
 */
async function tryAddColumn(query, sql) {
  try {
    await query(sql);
  } catch (err) {
    const msg = String(err.message || '');
    if (!/duplicate column|already exists/i.test(msg)) {
      /* ignore for fresh installs */
    }
  }
}

async function ensureBookingSchema(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS booking_pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      organiser TEXT NOT NULL DEFAULT '',
      duration_mins INTEGER NOT NULL DEFAULT 30,
      interval_mins INTEGER NOT NULL DEFAULT 30,
      days_ahead INTEGER NOT NULL DEFAULT 28,
      weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
      day_start TEXT NOT NULL DEFAULT '09:00',
      day_end TEXT NOT NULL DEFAULT '17:00',
      buffer_mins INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT '',
      google_place TEXT NOT NULL DEFAULT '',
      venue_lat TEXT NOT NULL DEFAULT '',
      venue_lng TEXT NOT NULL DEFAULT '',
      venue_radius_m INTEGER NOT NULL DEFAULT 200,
      online_link TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT NOW(),
      updated_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS booking_appointments (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      slot_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      duration_mins INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'booked',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await tryAddColumn(
    query,
    `ALTER TABLE booking_pages ADD COLUMN location TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE booking_pages ADD COLUMN google_place TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE booking_pages ADD COLUMN venue_lat TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE booking_pages ADD COLUMN venue_lng TEXT NOT NULL DEFAULT ''`
  );
  await tryAddColumn(
    query,
    `ALTER TABLE booking_pages ADD COLUMN venue_radius_m INTEGER NOT NULL DEFAULT 200`
  );

  await query(
    `CREATE INDEX IF NOT EXISTS idx_booking_appt_page ON booking_appointments (page_id)`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_booking_appt_slot ON booking_appointments (page_id, slot_date, slot_time)`
  );
}

module.exports = { ensureBookingSchema };
