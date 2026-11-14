import React, { useState } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Stethoscope, FileText, ShieldAlert, Database, Tv, KeyRound,
  LogOut, User, ShieldCheck, Clock, RefreshCw, AlertTriangle
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
  const navigate = useNavigate();
  const location = useLocation();
  const { isConnected } = useHospitalWebSocket();

  // Full-bleed TV / reception boards — no chrome
  if (location.pathname.startsWith('/lobby-display') || location.pathname.startsWith('/reception-display')) {
    return null;
  }

  const role = isAuthenticated ? user?.role : null;
  const navLinks = navLinksForRole(role);

  const handleLogout = async () => {
    await logout(true);
    navigate('/', { replace: true });
  };

  return (
    <header className="hospital-navbar">
      <div className="navbar-top-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="live-pulse-dot" style={{ backgroundColor: '#4ade80' }} />
          <strong>24×7 Emergency Desk:</strong>
          <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>108</span>
          <span>•</span>
          <span>Blood Bank</span>
          <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>104</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
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

        {navLinks.length > 0 ? (
          <nav className="navbar-links" aria-label="Primary">
            {navLinks.map((link) => {
              const Icon = ICONS[link.icon] || Home;
              return (
                <NavLink
                  key={link.path}
                  to={link.path}
                  end={link.path === '/'}
                  className={({ isActive }) => `nav-link-btn ${isActive ? 'active' : ''}`}
                >
                  <Icon size={16} />
                  <span>{link.name}</span>
                </NavLink>
              );
            })}
          </nav>
        ) : (
          <div className="navbar-links" aria-hidden="true" />
        )}

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
            <button type="button" onClick={() => setAuthModalOpen(true)} className="login-btn">
              <User size={15} />
              <span>Sign in</span>
            </button>
          )}
        </div>
      </div>

      <UnifiedAuthModal
        isOpen={authModalOpen}
        initialRole="patient"
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(role) => {
          if (role === 'doctor') navigate('/doctor', { replace: true });
          else if (role === 'admin') navigate('/admin', { replace: true });
          else navigate('/patient', { replace: true });
        }}
      />
    </header>
  );
}
