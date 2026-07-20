function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    organization: row.organization || '',
    role: row.role || 'user',
    status: row.status || 'pending',
    createdAt: row.created_at,
  };
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function validateRegister({ fullName, email, password }) {
  const name = String(fullName || '').trim();
  const mail = normalizeEmail(email);
  const pass = String(password || '');

  if (name.length < 2) return 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    return 'Please enter a valid email address.';
  }
  if (pass.length < 6) return 'Password must be at least 6 characters.';
  return null;
}

function statusLoginError(status) {
  if (status === 'pending') {
    return 'Your account is waiting for superadmin approval. You cannot sign in yet.';
  }
  if (status === 'rejected') {
    return 'Your account registration was rejected. Contact your administrator.';
  }
  return null;
}

module.exports = {
  publicUser,
  normalizeEmail,
  validateRegister,
  statusLoginError,
};
