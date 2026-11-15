import React, { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Stethoscope, FileText, ShieldAlert, Database, Tv, KeyRound,
  LogOut, User, ShieldCheck, Clock, RefreshCw, AlertTriangle, Menu, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import UnifiedAuthModal from './UnifiedAuthModal';
import { useHospitalWebSocket } from '../services/useHospitalWebSocket';
import { navLinksForRole, homePathForRole } from '../utils/sessionRoutes';

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
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isConnected } = useHospitalWebSocket();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // Full-bleed TV / reception boards — no chrome
  if (location.pathname.startsWith('/lobby-display') || location.pathname.startsWith('/reception-display')) {
    return null;
  }

  const role = isAuthenticated ? user?.role : null;
  const navLinks = navLinksForRole(role);

  const handleLogout = async () => {
    setMobileOpen(false);
    await logout(true);
    navigate('/', { replace: true });
  };

  const renderNavLinks = (onNavigate) => (
    navLinks.length > 0 ? (
      <nav className="navbar-links" aria-label="Primary">
        {navLinks.map((link) => {
          const Icon = ICONS[link.icon] || Home;
          return (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.path === '/'}
              className={({ isActive }) => `nav-link-btn ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate?.()}
            >
              <Icon size={16} />
              <span>{link.name}</span>
            </NavLink>
          );
        })}
      </nav>
    ) : (
      <div className="navbar-links" aria-hidden="true" />
    )
  );

  const renderActions = (onNavigate) => (
    <div className="navbar-actions">
      <div className={`ws-status-badge ${isConnected ? '' : 'disconnected'}`}>
        <span className="live-pulse-dot" style={{ backgroundColor: isConnected ? '#10b981' : '#ef4444' }} />
        <span>{isConnected ? 'Live' : 'Offline'}</span>
      </div>

      {isAuthenticated ? (
        <div className="nav-user-cluster">
          {session?.sessionId && (
            <button
              type="button"
              className="session-pill"
              title="Refresh session"
              onClick={refreshHeartbeat}
            >
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
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            setAuthModalOpen(true);
          }}
          className="login-btn"
        >
          <User size={15} />
          <span>Sign in</span>
        </button>
      )}
    </div>
  );

  return (
    <header className={`hospital-navbar ${mobileOpen ? 'nav-mobile-open' : ''}`}>
      <div className="navbar-top-strip">
        <div className="navbar-top-emergency">
          <span className="live-pulse-dot" style={{ backgroundColor: '#4ade80' }} />
          <strong>24×7 Emergency:</strong>
          <span className="navbar-top-chip">108</span>
          <span className="navbar-top-sep">•</span>
          <span>Blood Bank</span>
          <span className="navbar-top-chip">104</span>
        </div>
        <div className="navbar-top-abdm">
          <ShieldCheck size={15} style={{ color: '#4ade80' }} />
          <span>ABDM-Compliant • Government of Karnataka • National Health Mission</span>
        </div>
      </div>

      {sessionWarning && isAuthenticated && (
        <div className="session-warn-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} style={{ color: '#d97706' }} />
            <span>
              Session expires in <strong>{sessionMinutesLeft || 3} min</strong> — keep working or extend.
            </span>
          </div>
          <button type="button" className="session-keep-btn" onClick={refreshHeartbeat}>
            <RefreshCw size={12} /> Keep active
          </button>
        </div>
      )}

      <div className="navbar-main">
        <Link to={isAuthenticated ? homePathForRole(role) : '/'} className="navbar-brand">
          <div className="brand-icon">+</div>
          <div>
            <div className="brand-title">Sushrutha Grid</div>
            <div className="brand-subtitle">
              {role === 'patient' ? 'Patient portal' : role === 'doctor' ? 'Clinical desk' : role === 'admin' ? 'Admin console' : 'Hospital Coordination Platform'}
            </div>
          </div>
        </Link>

        <div className="navbar-desktop-cluster">
          {renderNavLinks()}
          {renderActions()}
        </div>

        <button
          type="button"
          className="navbar-menu-toggle"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="navbar-mobile-backdrop"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="navbar-mobile-panel" id="navbar-mobile-panel">
            {renderNavLinks(() => setMobileOpen(false))}
            {renderActions(() => setMobileOpen(false))}
          </div>
        </>
      )}

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
