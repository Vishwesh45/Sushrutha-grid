import React, { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Stethoscope, FileText, ShieldAlert, Database, Tv, KeyRound,
  LogOut, User, ShieldCheck, Clock, RefreshCw, AlertTriangle, Menu, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useShellMenu } from '../context/ShellMenuContext';
import UnifiedAuthModal from './UnifiedAuthModal';
import { useHospitalWebSocket } from '../services/useHospitalWebSocket';
import { toolLinksForRole, homePathForRole } from '../utils/sessionRoutes';

const ICONS = {
  home: Home,
  patient: Stethoscope,
  doctor: FileText,
  admin: ShieldAlert,
  tv: Tv,
  key: KeyRound,
  db: Database,
};

export default function NavigationNavbar() {
  const {
    user,
    session,
    sessionMinutesLeft,
    sessionWarning,
    refreshHeartbeat,
    isAuthenticated,
    logout,
  } = useAuth();
  const { pageMenu } = useShellMenu();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isConnected } = useHospitalWebSocket();

  const role = isAuthenticated ? user?.role : null;
  const toolLinks = toolLinksForRole(role);
  const onAdmin = location.pathname.startsWith('/admin');
  const hasDrawerContent = Boolean(pageMenu?.groups?.length) || toolLinks.length > 0 || isAuthenticated;

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  // Full-bleed TV / reception boards — no chrome
  if (location.pathname.startsWith('/lobby-display') || location.pathname.startsWith('/reception-display')) {
    return null;
  }

  const handleLogout = async () => {
    setMobileOpen(false);
    await logout(true);
    navigate('/', { replace: true });
  };

  const closeDrawer = () => setMobileOpen(false);

  return (
    <header className={`hospital-navbar ${mobileOpen ? 'nav-mobile-open' : ''} ${onAdmin ? 'hospital-navbar--admin' : ''}`}>
      <div className="navbar-top-strip">
        <div className="navbar-top-emergency">
          <span className="live-pulse-dot" style={{ backgroundColor: '#4ade80' }} />
          <strong>Emergency</strong>
          <span className="navbar-top-chip">108</span>
          <span className="navbar-top-sep">•</span>
          <span>Blood</span>
          <span className="navbar-top-chip">104</span>
        </div>
        <div className="navbar-top-abdm">
          <ShieldCheck size={15} style={{ color: '#4ade80' }} />
          <span>ABDM · Govt. of Karnataka · NHM</span>
        </div>
      </div>

      {sessionWarning && isAuthenticated && (
        <div className="session-warn-banner">
          <div className="session-warn-copy">
            <AlertTriangle size={16} style={{ color: '#d97706' }} />
            <span>
              Session ends in <strong>{sessionMinutesLeft || 3} min</strong>
            </span>
          </div>
          <button type="button" className="session-keep-btn" onClick={refreshHeartbeat}>
            <RefreshCw size={12} /> Keep active
          </button>
        </div>
      )}

      <div className="navbar-main">
        {hasDrawerContent && (
          <button
            type="button"
            className="navbar-menu-toggle"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="shell-drawer"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        )}

        <Link to={isAuthenticated ? homePathForRole(role) : '/'} className="navbar-brand" onClick={closeDrawer}>
          <div className="brand-icon">+</div>
          <div>
            <div className="brand-title">Sushrutha Grid</div>
            <div className="brand-subtitle">
              {role === 'patient' ? 'Patient portal' : role === 'doctor' ? 'Clinical desk' : role === 'admin' ? 'Admin console' : 'Hospital Coordination Platform'}
            </div>
          </div>
        </Link>

        <div className="navbar-desktop-cluster">
          <div className={`ws-status-badge ${isConnected ? '' : 'disconnected'}`}>
            <span className="live-pulse-dot" style={{ backgroundColor: isConnected ? '#10b981' : '#ef4444' }} />
            <span>{isConnected ? 'Live' : 'Offline'}</span>
          </div>

          {isAuthenticated ? (
            <div className="nav-user-cluster">
              {session?.sessionId && (
                <button type="button" className="session-pill" title="Refresh session" onClick={refreshHeartbeat}>
                  <Clock size={13} />
                  <span>{sessionMinutesLeft ? `${sessionMinutesLeft}m` : 'Active'}</span>
                </button>
              )}
              <div className="nav-user-chip">
                <span className={`role-pill role-${user?.role || 'guest'}`}>{user?.role || 'USER'}</span>
                <strong>{user?.name || user?.username}</strong>
                {user?.uhid && <span className="nav-uhid">{user.uhid}</span>}
              </div>
              <button type="button" onClick={handleLogout} className="btn-signout">
                <LogOut size={14} /> Sign out
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAuthModalOpen(true)} className="login-btn">
              <User size={15} />
              <span>Sign in</span>
            </button>
          )}
        </div>

        <div className="navbar-mobile-end">
          <div className={`ws-status-badge ws-status-badge--compact ${isConnected ? '' : 'disconnected'}`}>
            <span className="live-pulse-dot" style={{ backgroundColor: isConnected ? '#10b981' : '#ef4444' }} />
            <span>{isConnected ? 'Live' : 'Off'}</span>
          </div>
          {isAuthenticated ? (
            <button
              type="button"
              className="navbar-avatar-btn"
              aria-label="Open account menu"
              onClick={() => setMobileOpen(true)}
            >
              {(user?.name || 'U').slice(0, 1).toUpperCase()}
            </button>
          ) : (
            <button type="button" onClick={() => setAuthModalOpen(true)} className="login-btn login-btn--compact">
              <User size={15} />
              <span>Sign in</span>
            </button>
          )}
        </div>
      </div>

      {/* One coordinated left drawer for the whole site */}
      <div
        className={`shell-drawer-backdrop ${mobileOpen ? 'is-open' : ''}`}
        onClick={closeDrawer}
        aria-hidden={!mobileOpen}
      />
      <aside
        id="shell-drawer"
        className={`shell-drawer ${mobileOpen ? 'is-open' : ''}`}
        aria-hidden={!mobileOpen}
        aria-label="Site menu"
      >
        <div className="shell-drawer-head">
          <div>
            <strong>{pageMenu?.title || (isAuthenticated ? 'Menu' : 'Explore')}</strong>
            <span>{user?.name || 'Sushrutha Grid'}</span>
          </div>
          <button type="button" className="shell-drawer-close" aria-label="Close menu" onClick={closeDrawer}>
            <X size={18} />
          </button>
        </div>

        <div className="shell-drawer-body">
          {pageMenu?.groups?.length > 0 && (
            <div className="shell-drawer-block">
              <div className="shell-drawer-label">On this page</div>
              {pageMenu.groups.map((group) => (
                <div key={group.label} className="shell-drawer-group">
                  <div className="shell-drawer-group-label">{group.label}</div>
                  {group.items.map((item) => {
                    const Icon = item.Icon || Home;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`shell-drawer-link ${item.active ? 'active' : ''}`}
                        onClick={() => {
                          item.onSelect?.();
                          closeDrawer();
                        }}
                      >
                        <Icon size={17} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {toolLinks.length > 0 && (
            <div className="shell-drawer-block">
              <div className="shell-drawer-label">{pageMenu ? 'More tools' : 'Go to'}</div>
              {toolLinks.map((link) => {
                const Icon = ICONS[link.icon] || Home;
                return (
                  <NavLink
                    key={link.path}
                    to={link.path}
                    className={({ isActive }) => `shell-drawer-link ${isActive ? 'active' : ''}`}
                    onClick={closeDrawer}
                  >
                    <Icon size={17} />
                    <span>{link.name}</span>
                  </NavLink>
                );
              })}
            </div>
          )}

          <div className="shell-drawer-block shell-drawer-account">
            <div className="shell-drawer-label">Account</div>
            {isAuthenticated ? (
              <>
                <div className="shell-drawer-user">
                  <div className="navbar-avatar-btn" aria-hidden="true">
                    {(user?.name || 'U').slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>{user?.name || user?.username}</strong>
                    <span className={`role-pill role-${user?.role || 'guest'}`}>{user?.role}</span>
                  </div>
                </div>
                {session?.sessionId && (
                  <button type="button" className="shell-drawer-link" onClick={refreshHeartbeat}>
                    <Clock size={17} />
                    <span>Session {sessionMinutesLeft ? `${sessionMinutesLeft}m left` : 'active'} — refresh</span>
                  </button>
                )}
                <button type="button" className="shell-drawer-link shell-drawer-link--danger" onClick={handleLogout}>
                  <LogOut size={17} />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="shell-drawer-link active"
                onClick={() => {
                  closeDrawer();
                  setAuthModalOpen(true);
                }}
              >
                <User size={17} />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      <UnifiedAuthModal
        isOpen={authModalOpen}
        initialRole="patient"
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(signedRole) => {
          if (signedRole === 'doctor') navigate('/doctor', { replace: true });
          else if (signedRole === 'admin') navigate('/admin', { replace: true });
          else navigate('/patient', { replace: true });
        }}
      />
    </header>
  );
}
