/**
 * Client-side password rules — keep in sync with backend authHelpers.validatePassword.
 * Min 8 chars, at least one letter and one number.
 */
export function validatePasswordClient(password) {
  const pass = String(password || '');
  if (pass.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Za-z]/.test(pass) || !/[0-9]/.test(pass)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

export const PASSWORD_HINT = 'Min 8 characters, with a letter and a number';
