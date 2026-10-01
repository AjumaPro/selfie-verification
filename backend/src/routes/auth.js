const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { signToken, authRequired, requireSuperAdmin } = require('../middleware/auth');
const {
  publicUser,
  normalizeEmail,
  validateRegister,
  validatePassword,
  statusLoginError,
} = require('./authHelpers');
const {
  encryptPasswordForVault,
  decryptPasswordFromVault,
} = require('../utils/passwordVault');
const { createRateLimiter, authAttemptKey, clientIp } = require('../middleware/rateLimit');

const router = express.Router();

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyFn: authAttemptKey,
  message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  keyFn: (req) => `reg:${clientIp(req)}`,
  message: 'Too many registration attempts from this network. Please try again later.',
});

const USER_SELECT =
  'id, email, full_name, organization, role, status, password_hash, created_at';

async function setPasswordColumns(plainPassword) {
  const password = String(plainPassword || '');
  const passwordHash = await bcrypt.hash(password, 12);
  const passwordVault = encryptPasswordForVault(password);
  return { passwordHash, passwordVault };
}

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { fullName, email, password, organization } = req.body || {};
    const err = validateRegister({ fullName, email, password });
    if (err) return res.status(400).json({ error: err });

    const mail = normalizeEmail(email);
    const name = String(fullName).trim();
    const org = String(organization || '').trim();
    const { passwordHash, passwordVault } = await setPasswordColumns(password);

    const existing = await query('SELECT id FROM users WHERE email = $1', [mail]);
    if (existing.rowCount > 0) {
      return res
        .status(409)
        .json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const result = await query(
      `INSERT INTO users (email, full_name, organization, password_hash, password_vault, role, status)
       VALUES ($1, $2, $3, $4, $5, 'user', 'pending')
       RETURNING id, email, full_name, organization, role, status, created_at`,
      [mail, name, org, passwordHash, passwordVault]
    );

    // Self-registration does not log the user in — superadmin must approve first
    return res.status(201).json({
      pending: true,
      message:
        'Registration submitted. A superadmin must approve your account before you can sign in.',
      user: publicUser(result.rows[0]),
    });
  } catch (e) {
    console.error('register error:', e);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

async function loginWithRoleCheck(req, res, { requireRole = null } = {}) {
  const mail = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!mail || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const result = await query(`SELECT ${USER_SELECT} FROM users WHERE email = $1`, [mail]);

  if (result.rowCount === 0) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const row = result.rows[0];
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (requireRole && row.role !== requireRole) {
    return res.status(403).json({
      error:
        requireRole === 'superadmin'
          ? 'This account is not a superadmin. Use Super Admin login with a superadmin account.'
          : 'Access denied for this role.',
    });
  }

  if (!requireRole && row.role === 'superadmin') {
    return res.status(403).json({
      error: 'Superadmin accounts must use Super Admin login.',
    });
  }

  const blocked = statusLoginError(row.status);
  if (blocked) {
    return res.status(403).json({ error: blocked, status: row.status });
  }

  const user = publicUser(row);
  const token = signToken(user);
  return res.json({ user, token });
}

router.post('/login', loginLimiter, async (req, res) => {
  try {
    return await loginWithRoleCheck(req, res);
  } catch (e) {
    console.error('login error:', e);
    const dbDown =
      e?.code === 'ECONNREFUSED' ||
      e?.code === 'ETIMEDOUT' ||
      e?.code === 'ENOTFOUND' ||
      e?.code === '57P01' ||
      /database|connect|ssl|timeout/i.test(String(e?.message || ''));
    if (dbDown) {
      const localHint =
        process.env.NODE_ENV !== 'production'
          ? ' Local: open DigitalOcean → Database → Settings → Trusted Sources and add your public IP, then retry.'
          : ' On App Platform: bind DATABASE_URL to ${db.DATABASE_URL} and redeploy.';
      return res.status(503).json({ error: `Database unavailable.${localHint}` });
    }
    return res.status(500).json({ error: 'Sign in failed. Please try again.' });
  }
});

router.post('/superadmin/login', loginLimiter, async (req, res) => {
  try {
    return await loginWithRoleCheck(req, res, { requireRole: 'superadmin' });
  } catch (e) {
    console.error('superadmin login error:', e);
    const dbDown =
      e?.code === 'ECONNREFUSED' ||
      e?.code === 'ETIMEDOUT' ||
      e?.code === 'ENOTFOUND' ||
      e?.code === '57P01' ||
      /database|connect|ssl|timeout/i.test(String(e?.message || ''));
    if (dbDown) {
      const localHint =
        process.env.NODE_ENV !== 'production'
          ? ' Local: open DigitalOcean → Database → Settings → Trusted Sources and add your public IP, then retry.'
          : ' On App Platform: bind DATABASE_URL to ${db.DATABASE_URL} and redeploy.';
      return res.status(503).json({
        error: `Database unavailable.${localHint}`,
      });
    }
    if (/JWT_SECRET/i.test(String(e?.message || ''))) {
      return res.status(500).json({
        error: 'Server misconfigured: set JWT_SECRET in App Platform env vars.',
      });
    }
    return res.status(500).json({ error: 'Superadmin sign in failed. Please try again.' });
  }
});

router.get('/me', authRequired, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, organization, role, status, created_at
       FROM users WHERE id = $1`,
      [req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    const user = publicUser(result.rows[0]);
    if (user.status !== 'approved') {
      return res.status(403).json({
        error: statusLoginError(user.status) || 'Account not approved',
        status: user.status,
      });
    }
    return res.json({ user });
  } catch (e) {
    console.error('me error:', e);
    return res.status(500).json({ error: 'Could not load profile' });
  }
});

router.get('/users', authRequired, requireSuperAdmin, async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, organization, role, status, created_at
       FROM users
       ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
         created_at DESC`
    );
    return res.json({ users: result.rows.map(publicUser) });
  } catch (e) {
    console.error('users list error:', e);
    return res.status(500).json({ error: 'Could not load users' });
  }
});

/** Superadmin creates an account (optionally pre-approved) */
router.post('/users', authRequired, requireSuperAdmin, async (req, res) => {
  try {
    const { fullName, email, password, organization, role, status } = req.body || {};
    const err = validateRegister({ fullName, email, password });
    if (err) return res.status(400).json({ error: err });

    const mail = normalizeEmail(email);
    const name = String(fullName).trim();
    const org = String(organization || '').trim();
    const nextRole = role === 'superadmin' ? 'superadmin' : 'user';
    const nextStatus =
      status === 'pending' || status === 'rejected' ? status : 'approved';

    const existing = await query('SELECT id FROM users WHERE email = $1', [mail]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const { passwordHash, passwordVault } = await setPasswordColumns(password);
    const result = await query(
      `INSERT INTO users (email, full_name, organization, password_hash, password_vault, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, full_name, organization, role, status, created_at`,
      [mail, name, org, passwordHash, passwordVault, nextRole, nextStatus]
    );

    return res.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (e) {
    console.error('create user error:', e);
    return res.status(500).json({ error: 'Could not create account' });
  }
});

router.patch('/users/:id/status', authRequired, requireSuperAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const nextStatus = String(req.body?.status || '').toLowerCase().trim();
    if (!id) {
      return res.status(400).json({ error: 'User id is required.' });
    }
    if (!['pending', 'approved', 'rejected'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Status must be pending, approved, or rejected.' });
    }

    const existing = await query(`SELECT id, role FROM users WHERE id = $1`, [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (String(existing.rows[0].role) === 'superadmin' && nextStatus !== 'approved') {
      return res.status(400).json({ error: 'Cannot reject or pend a superadmin account.' });
    }

    const result = await query(
      `UPDATE users SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, full_name, organization, role, status, created_at`,
      [id, nextStatus]
    );

    return res.json({ user: publicUser(result.rows[0]) });
  } catch (e) {
    console.error('status update error:', e);
    return res.status(500).json({ error: e.message || 'Could not update account status' });
  }
});

router.delete('/users/:id', authRequired, requireSuperAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'User id is required.' });
    }
    if (String(id) === String(req.userId)) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const existing = await query(`SELECT id, role FROM users WHERE id = $1`, [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (String(existing.rows[0].role) === 'superadmin') {
      return res.status(400).json({ error: 'Cannot delete a superadmin account.' });
    }

    await query(`DELETE FROM users WHERE id = $1`, [id]);
    return res.json({ ok: true, id });
  } catch (e) {
    console.error('delete user error:', e);
    if (e?.code === '23503') {
      return res.status(409).json({
        error:
          'Cannot delete this account because related records still exist. Reject the account instead, or contact support.',
      });
    }
    return res.status(500).json({ error: e.message || 'Could not delete account' });
  }
});

/** Change own password (any signed-in user) */
router.patch('/me/password', authRequired, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    const passErr = validatePassword(newPassword);
    if (passErr) {
      return res.status(400).json({ error: passErr });
    }

    const result = await query(
      `SELECT id, password_hash FROM users WHERE id = $1`,
      [req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ok = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const { passwordHash, passwordVault } = await setPasswordColumns(newPassword);
    await query(
      `UPDATE users SET password_hash = $2, password_vault = $3, updated_at = NOW() WHERE id = $1`,
      [req.userId, passwordHash, passwordVault]
    );

    return res.json({ ok: true, message: 'Password updated.' });
  } catch (e) {
    console.error('change password error:', e);
    return res.status(500).json({ error: 'Could not change password' });
  }
});

/** Update own profile (name / email / organization) */
router.patch('/me', authRequired, async (req, res) => {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = normalizeEmail(req.body?.email);
    const organization = String(req.body?.organization || '').trim();

    if (fullName.length < 2) {
      return res.status(400).json({ error: 'Please enter your full name.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const clash = await query(
      `SELECT id FROM users WHERE email = $1 AND id <> $2`,
      [email, req.userId]
    );
    if (clash.rowCount > 0) {
      return res.status(409).json({ error: 'That email is already in use.' });
    }

    const result = await query(
      `UPDATE users
       SET full_name = $2, email = $3, organization = $4, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, full_name, organization, role, status, created_at`,
      [req.userId, fullName, email, organization]
    );

    return res.json({ user: publicUser(result.rows[0]) });
  } catch (e) {
    console.error('update profile error:', e);
    return res.status(500).json({ error: 'Could not update profile' });
  }
});

/** Superadmin views a user's password (from encrypted vault) */
router.get('/users/:id/password', authRequired, requireSuperAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'User id is required.' });
    }

    const existing = await query(
      `SELECT id, email, full_name, role, password_vault FROM users WHERE id = $1`,
      [id]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const row = existing.rows[0];
    if (!row.password_vault) {
      return res.status(404).json({
        error:
          'No viewable password stored for this account yet. Use Reset to set a password, then you can view and share it.',
        available: false,
      });
    }

    let password;
    try {
      password = decryptPasswordFromVault(row.password_vault);
    } catch (err) {
      console.error('password vault decrypt error:', err.message);
      return res.status(500).json({
        error:
          'Could not decrypt stored password. Reset the password to create a new viewable copy.',
        available: false,
      });
    }

    return res.json({
      available: true,
      password,
      email: row.email,
      fullName: row.full_name,
      userId: String(row.id),
    });
  } catch (e) {
    console.error('view password error:', e);
    return res.status(500).json({ error: e.message || 'Could not view password' });
  }
});

/** Superadmin resets another user's password */
router.patch('/users/:id/password', authRequired, requireSuperAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!id) {
      return res.status(400).json({ error: 'User id is required.' });
    }
    const passErr = validatePassword(newPassword);
    if (passErr) {
      return res.status(400).json({ error: passErr });
    }

    const existing = await query(`SELECT id, role FROM users WHERE id = $1`, [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash, passwordVault } = await setPasswordColumns(newPassword);
    await query(
      `UPDATE users SET password_hash = $2, password_vault = $3, updated_at = NOW() WHERE id = $1`,
      [id, passwordHash, passwordVault]
    );

    return res.json({
      ok: true,
      message: 'Password reset.',
      password: newPassword,
    });
  } catch (e) {
    console.error('reset password error:', e);
    return res.status(500).json({ error: e.message || 'Could not reset password' });
  }
});

/** Superadmin updates another user's profile */
router.patch('/users/:id', authRequired, requireSuperAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const fullName = String(req.body?.fullName || '').trim();
    const email = normalizeEmail(req.body?.email);
    const organization = String(req.body?.organization || '').trim();

    if (fullName.length < 2) {
      return res.status(400).json({ error: 'Please enter a full name.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const existing = await query(`SELECT id, role FROM users WHERE id = $1`, [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const clash = await query(
      `SELECT id FROM users WHERE email = $1 AND id <> $2`,
      [email, id]
    );
    if (clash.rowCount > 0) {
      return res.status(409).json({ error: 'That email is already in use.' });
    }

    const result = await query(
      `UPDATE users
       SET full_name = $2, email = $3, organization = $4, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, full_name, organization, role, status, created_at`,
      [id, fullName, email, organization]
    );

    return res.json({ user: publicUser(result.rows[0]) });
  } catch (e) {
    console.error('update user error:', e);
    return res.status(500).json({ error: 'Could not update account' });
  }
});

module.exports = router;
