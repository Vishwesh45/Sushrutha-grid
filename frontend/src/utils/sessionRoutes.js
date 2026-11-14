/**
 * Role → home path and navbar entries for a real multi-portal session.
 * Guests see portal choosers; signed-in users only see their workspace links.
 */

export function homePathForRole(role) {
  if (role === 'patient') return '/patient';
  if (role === 'doctor') return '/doctor';
  if (role === 'admin') return '/admin';
  if (role === 'volunteer') return '/volunteer';
  if (role === 'csr') return '/csr';
  return '/';
}

/** Guests: no portal chooser links — use unified Sign in. */
export const GUEST_NAV = [];

export function navLinksForRole(role) {
  // Signed-in users land in their workspace via auth; keep navbar clean (no Patient/Doctor/Admin tabs).
  if (role === 'patient' || role === 'doctor' || role === 'admin') {
    return [];
  }
  return GUEST_NAV;
}

export function roleAllowedOnPath(role, pathname) {
  if (!role) return true;
  if (pathname.startsWith('/patient')) return role === 'patient';
  if (pathname.startsWith('/doctor')) return role === 'doctor' || role === 'admin';
  if (pathname.startsWith('/admin')) return role === 'admin';
  if (pathname.startsWith('/volunteer')) return role === 'volunteer' || role === 'admin';
  if (pathname.startsWith('/csr')) return role === 'csr' || role === 'admin';
  return true;
}
