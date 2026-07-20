const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { signToken, authRequired, requireSuperAdmin } = require('../middleware/auth');
const {
  publicUser,
  normalizeEmail,
  validateRegister,
  statusLoginError,
} = require('./authHelpers');

const router = express.Router();

const USER_SELECT =
  'id, email, full_name, organization, role, status, password_hash, created_at';

router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, organization } = req.body || {};
    const err = validateRegister({ fullName, email, password });
    if (err) return res.status(400).json({ error: err });

    const mail = normalizeEmail(email);
    const name = String(fullName).trim();
    const org = String(organization || '').trim();
    const passwordHash = await bcrypt.hash(String(password), 12);

    const existing = await query('SELECT id FROM users WHERE email = $1', [mail]);
    if (existing.rowCount > 0) {
      return res
        .status(409)
        .json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const result = await query(
      `INSERT INTO users (email, full_name, organization, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'user', 'pending')
       RETURNING id, email, full_name, organization, role, status, created_at`,
      [mail, name, org, passwordHash]
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

router.post('/login', async (req, res) => {
  try {
    return await loginWithRoleCheck(req, res);
  } catch (e) {
    console.error('login error:', e);
    return res.status(500).json({ error: 'Sign in failed. Please try again.' });
  }
});

router.post('/superadmin/login', async (req, res) => {
  try {
    return await loginWithRoleCheck(req, res, { requireRole: 'superadmin' });
  } catch (e) {
    console.error('superadmin login error:', e);
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

    const passwordHash = await bcrypt.hash(String(password), 12);
    const result = await query(
      `INSERT INTO users (email, full_name, organization, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, full_name, organization, role, status, created_at`,
      [mail, name, org, passwordHash, nextRole, nextStatus]
    );

    return res.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (e) {
    console.error('create user error:', e);
    return res.status(500).json({ error: 'Could not create account' });
  }
});

router.patch('/users/:id/status', authRequired, requireSuperAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const nextStatus = String(req.body?.status || '').toLowerCase();
    if (!['pending', 'approved', 'rejected'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Status must be pending, approved, or rejected.' });
    }

    const existing = await query(`SELECT id, role FROM users WHERE id = $1`, [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (existing.rows[0].role === 'superadmin' && nextStatus !== 'approved') {
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
    return res.status(500).json({ error: 'Could not update account status' });
  }
});

router.delete('/users/:id', authRequired, requireSuperAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (id === req.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const existing = await query(`SELECT id, role FROM users WHERE id = $1`, [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (existing.rows[0].role === 'superadmin') {
      return res.status(400).json({ error: 'Cannot delete a superadmin account.' });
    }

    await query(`DELETE FROM users WHERE id = $1`, [id]);
    return res.json({ ok: true, id });
  } catch (e) {
    console.error('delete user error:', e);
    return res.status(500).json({ error: 'Could not delete account' });
  }
});

module.exports = router;
