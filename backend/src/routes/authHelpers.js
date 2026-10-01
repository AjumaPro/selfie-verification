function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id != null ? String(row.id) : '',
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

/** Min length 8, at least one letter and one number. */
function validatePassword(password) {
  const pass = String(password || '');
  if (pass.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Za-z]/.test(pass) || !/[0-9]/.test(pass)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

function validateRegister({ fullName, email, password }) {
  const name = String(fullName || '').trim();
  const mail = normalizeEmail(email);

  if (name.length < 2) return 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    return 'Please enter a valid email address.';
  }
  const passErr = validatePassword(password);
  if (passErr) return passErr;
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
  validatePassword,
  validateRegister,
  statusLoginError,
};
