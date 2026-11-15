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

/** Guests: public utility links (Sign in stays a primary header CTA). */
export const GUEST_NAV = [
  { path: '/knowledge-base', name: 'Guides', icon: 'db' },
  { path: '/lobby-display', name: 'Lobby TV', icon: 'tv' },
];

/**
 * Desktop stays minimal (empty for core clinical roles).
 * Mobile drawer uses toolLinksForRole + page sections from ShellMenuContext.
 */
export function navLinksForRole(role) {
  if (role === 'patient' || role === 'doctor' || role === 'admin') {
    return [];
  }
  if (role === 'volunteer' || role === 'csr') {
    return [
      { path: homePathForRole(role), name: role === 'csr' ? 'CSR portal' : 'Volunteer portal', icon: 'home' },
      { path: '/knowledge-base', name: 'Guides', icon: 'db' },
    ];
  }
  return GUEST_NAV;
}

/** Secondary destinations shown in the mobile shell drawer. */
export function toolLinksForRole(role) {
  if (role === 'admin') {
    return [
      { path: '/reception-display', name: 'Reception board', icon: 'key' },
      { path: '/lobby-display', name: 'Lobby TV', icon: 'tv' },
      { path: '/volunteer', name: 'Volunteer portal', icon: 'home' },
      { path: '/csr', name: 'CSR portal', icon: 'home' },
      { path: '/knowledge-base', name: 'Guides', icon: 'db' },
    ];
  }
  if (role === 'doctor') {
    return [
      { path: '/doctor', name: 'OPD desk', icon: 'doctor' },
      { path: '/lobby-display', name: 'Lobby TV', icon: 'tv' },
      { path: '/knowledge-base', name: 'Guides', icon: 'db' },
    ];
  }
  if (role === 'patient') {
    return [
      { path: '/patient', name: 'My visit', icon: 'patient' },
      { path: '/knowledge-base', name: 'Guides', icon: 'db' },
    ];
  }
  if (role === 'volunteer' || role === 'csr') {
    return navLinksForRole(role);
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
