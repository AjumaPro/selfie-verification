require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, engine } = require('./pool');

async function migratePostgres(client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  const { ensureMeetingsSchema } = require('./meetingsSchema');
  await ensureMeetingsSchema((text, params) => client.query(text, params));
  const { ensureVerifySchema } = require('./verifySchema');
  await ensureVerifySchema((text, params) => client.query(text, params));

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  `);

  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
  `);
  await client.query(`
    ALTER TABLE users ALTER COLUMN status SET DEFAULT 'pending'
  `);

  try {
    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'superadmin'))
    `);
  } catch (e) {
    console.warn('role constraint note:', e.message);
  }

  try {
    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check`);
    await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'))
    `);
  } catch (e) {
    console.warn('status constraint note:', e.message);
  }

  await client.query(`
    UPDATE users SET status = 'approved' WHERE role = 'superadmin'
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_users_status ON users (status)`);
}

async function migrateSqlite(client) {
  const { ensureMeetingsSchema } = require('./meetingsSchema');
  await ensureMeetingsSchema((text, params) => client.query(text, params));
  const { ensureVerifySchema } = require('./verifySchema');
  await ensureVerifySchema((text, params) => client.query(text, params));

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (gen_uuid()),
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.query(`
    UPDATE users SET status = 'approved' WHERE role = 'superadmin'
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_users_status ON users (status)`);
}

async function seedSuperadmin(client) {
  const email = String(process.env.SUPERADMIN_EMAIL || 'superadmin@glico.local')
    .trim()
    .toLowerCase();
  const password = String(process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@123');
  const fullName = String(process.env.SUPERADMIN_NAME || 'Super Admin').trim();

  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);

  if (existing.rowCount > 0) {
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      `UPDATE users
       SET role = 'superadmin',
           status = 'approved',
           full_name = $2,
           password_hash = $3,
           updated_at = NOW()
       WHERE email = $1`,
      [email, fullName, passwordHash]
    );
    console.log(`✓ Superadmin ready: ${email}`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO users (email, full_name, organization, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'superadmin', 'approved')`,
      [email, fullName, 'GLICO', passwordHash]
    );
    console.log(`✓ Superadmin created: ${email}`);
  }
}

async function migrate() {
  const client = await pool.connect();
  try {
    if (engine === 'sqlite') {
      console.log('Migrating SQLite (local/device)…');
      await migrateSqlite(client);
    } else {
      console.log('Migrating PostgreSQL…');
      await migratePostgres(client);
    }
    await seedSuperadmin(client);
    console.log('✓ Migration complete');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
