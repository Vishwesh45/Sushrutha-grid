import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Heart, LogOut, User, PhoneCall, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import UnifiedAuthModal from './UnifiedAuthModal';

export default function HeaderBanner({ onNavigateToTriage }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [metrics, setMetrics] = useState({
    total_consultations: 0,
    emergency_triage_count: 0,
    symptoms_ontology_count: 24,
    platform_status: 'Operational'
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await api.get('/patient/metrics/summary');
        setMetrics(res.data);
      } catch (err) {
        // Fallback silently if offline or initial load
      }
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="header-wrapper">
      {/* 1. Top Emergency Strip (Deep Maroon) */}
      <div className="top-emergency-bar">
        <div className="container bar-content">
          <div className="emergency-desk">
            <span className="live-dot-pulse">●</span>
            <strong>24×7 Emergency Coordination Desk</strong>
            <span className="sep">•</span>
            <span className="helpline">108</span>
            <span className="sep">•</span>
            <span>Blood Bank</span>
            <span className="helpline">104</span>
          </div>
          <div className="compliance-tag">
            <ShieldCheck size={13} className="inline-icon" />
            <span>ABDM-compliant • HL7 FHIR ready • Serving Government Hospitals across Karnataka</span>
          </div>
        </div>
      </div>

      {/* 2. Main Brand Navbar (White Surface) */}
      <header className="main-navbar">
        <div className="container nav-content">
          <div className="nav-brand">
            <div className="brand-logo-icon">
              <span className="cross-icon">+</span>
            </div>
            <div>
              <div className="brand-title">Sushrutha Grid</div>
              <div className="brand-sub">Hospital Digitisation • Real-Time Triage • Patient Coordination</div>
            </div>
          </div>

          <div className="nav-actions">
            {isAuthenticated ? (
              <div className="user-nav-chip">
                <span className={`user-badge role-tag-${user.role}`}>{user.role.toUpperCase()}</span>
                <span className="user-name">{user.name}</span>
                {user.uhid && (
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                    {user.uhid}
                  </span>
                )}
                <button className="btn btn-outline-sm btn-signout" onClick={logout} title="Sign Out">
                  <LogOut size={13} />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="guest-badge" style={{ display: 'none' }}>Guest Session</span>
                <button 
                  type="button"
                  className="btn btn-primary"
                  style={{
                    backgroundColor: '#1d4ed8',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onClick={() => setAuthModalOpen(true)}
                >
                  <User size={15} />
                  <span>Sign in / Register</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <UnifiedAuthModal
        isOpen={authModalOpen}
        initialRole="patient"
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          if (onNavigateToTriage) onNavigateToTriage();
        }}
      />

      {/* 3. Hero Section (Deep Crimson with Authentic Medical Aesthetic) */}
      <div className="hero-crimson-section">
        <div className="hero-pattern-overlay"></div>
        <div className="container hero-content">
          <div className="hero-text-side">
            <div className="heritage-badge">
              <Heart size={14} className="heart-icon" fill="currentColor" />
              <span>Service before everything — ಶುಶ್ರೂಷೆ means "care"</span>
            </div>

            <h1 className="hero-headline">
              <span>Every patient triaged.</span>
              <span>Every bed accounted for.</span>
              <span>Every rupee reaching care.</span>
            </h1>

            <p className="hero-subline">
              One intelligent coordination console for government hospitals — connecting patients,
              doctors, nurses, and care teams with authentic clinical semantic triage and zero synthetic bias.
            </p>

            <div className="ekg-heartbeat-line">
              <svg viewBox="0 0 500 40" className="ekg-svg" preserveAspectRatio="none">
                <path
                  d="M0,20 L120,20 L135,5 L145,35 L155,10 L165,25 L175,20 L300,20 L315,5 L325,35 L335,10 L345,25 L355,20 L500,20"
                  fill="none"
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>

          {/* Right Live Hospital Metrics Cards */}
          <div className="hero-telemetry-side">
            <div className="hero-stat-card">
              <div className="stat-card-label">TOTAL INTAKES</div>
              <div className="stat-card-value">{metrics.total_consultations}</div>
              <div className="stat-card-footer">Live Patient Consultations</div>
            </div>

            <div className="hero-stat-card">
              <div className="stat-card-label">EMERGENCY CASES</div>
              <div className="stat-card-value text-red-highlight">{metrics.emergency_triage_count}</div>
              <div className="stat-card-footer">RED Priority Flagged</div>
            </div>

            <div className="hero-stat-card">
              <div className="stat-card-label">CLINICAL KB CORPUS</div>
              <div className="stat-card-value">24 / 80+</div>
              <div className="stat-card-footer">Columbia / CDC Benchmark</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
