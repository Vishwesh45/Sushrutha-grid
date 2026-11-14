import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../utils/sessionRoutes';
import { ShieldAlert } from 'lucide-react';

/**
 * Protects a route by role.
 * - Guests: render children (login gate lives inside the page).
 * - Wrong role: bounce to that user's own workspace (no cross-portal hop).
 */
export default function RoleGate({ allow, children }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="session-boot card">
        <div className="live-pulse-dot" />
        <span>Restoring your hospital session…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return children;
  }

  const role = user?.role;
  if (allow && !allow.includes(role)) {
    return <Navigate to={homePathForRole(role)} replace state={{ from: location.pathname }} />;
  }

  return children;
}

/** Shown when a page still needs an explicit sign-out before switching portal. */
export function SwitchAccountPanel({ currentUser, onLogout, targetLabel }) {
  return (
    <div className="switch-account-panel card">
      <div className="switch-account-icon">
        <ShieldAlert size={28} />
      </div>
      <h3>Switch account to continue</h3>
      <p>
        You are signed in as <strong>{currentUser?.name}</strong>
        {' '}(<span className="role-pill">{currentUser?.role}</span>).
        Sign out first, then open the {targetLabel} portal with the correct credentials.
      </p>
      <button type="button" className="btn btn-primary" onClick={() => onLogout(true)}>
        Sign out &amp; switch
      </button>
    </div>
  );
}
