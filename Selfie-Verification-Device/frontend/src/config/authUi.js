/**
 * Control whether the Super Admin tab appears on the public sign-in screen.
 *
 * REACT_APP_SHOW_SUPERADMIN_LOGIN=false  → hide Admin tab (production)
 * Add ?admin=1 to the URL to open the admin login when hidden.
 */
export function isSuperAdminLoginPublic() {
  const flag = String(
    process.env.REACT_APP_SHOW_SUPERADMIN_LOGIN ?? 'true'
  )
    .trim()
    .toLowerCase();
  return flag !== 'false' && flag !== '0' && flag !== 'no';
}

export function hasSuperAdminLoginOverride() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('admin') === '1';
  } catch {
    return false;
  }
}

export function canUseSuperAdminLogin() {
  return isSuperAdminLoginPublic() || hasSuperAdminLoginOverride();
}
