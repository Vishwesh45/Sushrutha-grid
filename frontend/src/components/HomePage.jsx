import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Stethoscope, FileText, ShieldAlert, Tv, Database, ArrowRight,
  Heart, CheckCircle2, Mic, MapPin, Ticket, ClipboardList,
  Users, Gift, KeyRound, Star, ChevronRight,
  Activity, Building2, HandHeart
} from 'lucide-react';
import { useHospitalWebSocket } from '../services/useHospitalWebSocket';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../utils/sessionRoutes';

const FACILITIES = [
  {
    id: 'voice',
    title: 'Speak your symptoms',
    plain: 'Talk in your language. The app turns speech into text for the doctor.',
    icon: Mic,
    color: '#2563eb',
  },
  {
    id: 'route',
    title: 'Right department, faster',
    plain: 'Your complaint is matched to the right specialty and urgency (green / amber / red).',
    icon: Activity,
    color: '#059669',
  },
  {
    id: 'nearby',
    title: 'Nearby government hospitals',
    plain: 'Find hospitals around you on the map and see what is available.',
    icon: MapPin,
    color: '#c2410c',
  },
  {
    id: 'token',
    title: 'OPD token & live queue',
    plain: 'Get a token, watch your turn, and hear when your chamber calls you.',
    icon: Ticket,
    color: '#7c3aed',
  },
  {
    id: 'rx',
    title: 'Digital prescription',
    plain: 'After the visit, your medicine list and advice appear in your records.',
    icon: ClipboardList,
    color: '#0f766e',
  },
  {
    id: 'desk',
    title: 'Reception desk code',
    plain: 'Check in at the hospital desk with a short code before digital OPD.',
    icon: KeyRound,
    color: '#b45309',
  },
  {
    id: 'ratings',
    title: 'Rate your visit',
    plain: 'Share feedback on facility, department, doctor, and waiting area.',
    icon: Star,
    color: '#ca8a04',
  },
  {
    id: 'ngo',
    title: 'NGO & CSR support',
    plain: 'Volunteers can offer help; companies can support hospital needs from the footer.',
    icon: HandHeart,
    color: '#be123c',
  },
];

const JOURNEY = [
  { n: '1', title: 'Tell us how you feel', text: 'Type or speak. We listen carefully, including “no fever” style phrases.' },
  { n: '2', title: 'Get your token', text: 'After check-in, you receive an OPD token for the right department.' },
  { n: '3', title: 'Wait with clarity', text: 'Phone, lobby screen, and doctor desk stay in sync when your turn comes.' },
  { n: '4', title: 'Leave with your Rx', text: 'The doctor finishes the visit; your prescription shows up for you to keep.' },
];

export default function HomePage() {
  const { isConnected } = useHospitalWebSocket();
  const { user, isAuthenticated, loading } = useAuth();
  const role = isAuthenticated ? user?.role : null;
  const [openFacility, setOpenFacility] = useState('voice');
  const [activeJourney, setActiveJourney] = useState(0);

  // Signed-in staff/patients belong in their workspace — never the marketing landing page
  if (!loading && isAuthenticated && role) {
    return <Navigate to={homePathForRole(role)} replace />;
  }

  const allModules = [
    {
      id: 'patient',
      roles: ['guest', 'patient'],
      title: 'For patients',
      path: '/patient',
      icon: <Stethoscope size={24} color="#c4161c" />,
      tag: 'YOUR CARE',
      iconBg: '#fef2f2',
      description: 'Share symptoms, find hospitals, take a token, and see your prescription.',
      features: ['Voice or text', 'Live token', 'Visit history'],
      buttonText: role === 'patient' ? 'Continue my care' : 'Start as patient',
    },
    {
      id: 'doctor',
      roles: ['guest', 'doctor', 'admin'],
      title: 'For doctors',
      path: '/doctor',
      icon: <FileText size={24} color="#059669" />,
      tag: 'CHAMBER',
      iconBg: '#ecfdf5',
      description: 'See who is waiting, call the next patient, and write a clear prescription.',
      features: ['Queue board', 'Call next', 'Digital Rx'],
      buttonText: 'Open doctor desk',
    },
    {
      id: 'admin',
      roles: ['guest', 'admin'],
      title: 'For hospital admin',
      path: '/admin',
      icon: <ShieldAlert size={24} color="#1d4ed8" />,
      tag: 'OPERATIONS',
      iconBg: '#eff6ff',
      description: 'Manage doctors, watch OPD inflow, ratings, volunteers, and CSR needs.',
      features: ['Roster', 'OPD view', 'Partners'],
      buttonText: 'Open admin center',
    },
    {
      id: 'lobby',
      roles: ['guest', 'doctor', 'admin'],
      title: 'Lobby waiting screen',
      path: '/lobby-display',
      icon: <Tv size={24} color="#7c3aed" />,
      tag: 'DISPLAY',
      iconBg: '#f5f3ff',
      description: 'Big-screen board for the waiting hall when a token is called.',
      features: ['Now calling', 'Sound cue', 'Room guide'],
      buttonText: 'Open lobby screen',
    },
  ];

  const viewer = role || 'guest';
  const modules = allModules.filter((m) => m.roles.includes(viewer));

  return (
    <div className="home-container">
      {/* Hero */}
      <section className="home-hero-card home-hero-animate">
        <div className="hero-tag-strip">
          <span className="hero-badge">
            <Heart size={14} color="#fca5a5" fill="currentColor" />
            Care for government hospital patients · Karnataka
          </span>
          <span className="hero-badge" style={{ background: isConnected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)' }}>
            <span className="live-pulse-dot" style={{ backgroundColor: isConnected ? '#34d399' : '#f87171' }} />
            {isConnected ? 'Hospital updates live' : 'Connecting…'}
          </span>
        </div>

        <h1 className="hero-main-title">
          A calmer way through<br />
          the government hospital day
        </h1>

        <p className="hero-description">
          Sushrutha Grid helps you explain symptoms, reach the right department, take an OPD token,
          and leave with a clear digital prescription — together with doctors and hospital staff on one platform.
        </p>

        <div className="hero-actions-row">
          {role === 'patient' ? (
            <Link to="/patient" className="hero-btn-primary">
              <Stethoscope size={18} />
              <span>Go to my care</span>
              <ArrowRight size={16} />
            </Link>
          ) : role === 'doctor' ? (
            <Link to="/doctor" className="hero-btn-primary">
              <FileText size={18} />
              <span>Open doctor desk</span>
              <ArrowRight size={16} />
            </Link>
          ) : role === 'admin' ? (
            <Link to="/admin" className="hero-btn-primary">
              <ShieldAlert size={18} />
              <span>Open admin center</span>
              <ArrowRight size={16} />
            </Link>
          ) : (
            <>
              <Link to="/patient" className="hero-btn-primary">
                <Stethoscope size={18} />
                <span>I am a patient</span>
                <ArrowRight size={16} />
              </Link>
              <Link to="/doctor" className="hero-btn-secondary">
                <FileText size={18} />
                <span>I am a doctor</span>
              </Link>
              <Link to="/admin" className="hero-btn-secondary">
                <ShieldAlert size={18} />
                <span>Hospital admin</span>
              </Link>
            </>
          )}
          {!role && (
            <Link to="/knowledge-base" className="hero-btn-secondary">
              <Database size={18} />
              <span>Learn more</span>
            </Link>
          )}
        </div>

        {isAuthenticated && (
          <p className="session-home-note">
            Signed in as <strong>{user?.name}</strong> ({role}). Workspace: {homePathForRole(role)}.
          </p>
        )}

        <div className="hero-stats-grid">
          <div className="hero-stat-box">
            <div className="hero-stat-title">Who it helps</div>
            <div className="hero-stat-value">Patients</div>
            <div className="hero-stat-desc">Doctors · Admin · Partners</div>
          </div>
          <div className="hero-stat-box">
            <div className="hero-stat-title">Focus</div>
            <div className="hero-stat-value" style={{ color: '#6ee7b7' }}>OPD day</div>
            <div className="hero-stat-desc">From complaint to Rx</div>
          </div>
          <div className="hero-stat-box">
            <div className="hero-stat-title">Built for</div>
            <div className="hero-stat-value" style={{ color: '#fde047' }}>Govt. care</div>
            <div className="hero-stat-desc">Bengaluru civil hospitals</div>
          </div>
          <div className="hero-stat-box">
            <div className="hero-stat-title">Feel</div>
            <div className="hero-stat-value" style={{ color: '#93c5fd' }}>Live</div>
            <div className="hero-stat-desc">Screens update together</div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="home-story-section home-reveal">
        <div className="home-story-grid">
          <article className="home-story-block">
            <span className="section-tag">About</span>
            <h2 className="section-heading">What is Sushrutha Grid?</h2>
            <p>
              Sushrutha means care. This platform is a student-built hospital coordination system for
              Karnataka government hospitals. It connects the waiting patient, the doctor in chamber,
              and the admin desk — so fewer people get lost in paper queues and unclear directions.
            </p>
            <p>
              It is designed around real OPD life: crowded lobbies, multilingual speech, department
              routing, and a prescription you can open again later.
            </p>
          </article>
          <article className="home-story-block accent">
            <span className="section-tag" style={{ color: '#9f1239' }}>Purpose</span>
            <h2 className="section-heading">Why we built it</h2>
            <ul className="home-purpose-list">
              <li><CheckCircle2 size={16} /> Make the first hospital hour less confusing</li>
              <li><CheckCircle2 size={16} /> Guide people to the right specialty early</li>
              <li><CheckCircle2 size={16} /> Keep patient, doctor, and lobby screen in sync</li>
              <li><CheckCircle2 size={16} /> Leave every visit with a readable digital Rx</li>
              <li><CheckCircle2 size={16} /> Let NGOs and CSR support hospital needs cleanly</li>
            </ul>
          </article>
        </div>
      </section>

      {/* Facilities */}
      <section className="home-reveal">
        <div className="home-section-header">
          <div className="section-tag">Facilities</div>
          <h2 className="section-heading">What you can do here</h2>
          <p className="section-subtext">Tap a facility to see how it helps in plain words.</p>
        </div>

        <div className="facility-interactive">
          <div className="facility-chips" role="tablist" aria-label="Facilities">
            {FACILITIES.map((f) => {
              const Icon = f.icon;
              const active = openFacility === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`facility-chip ${active ? 'active' : ''}`}
                  style={{ '--chip': f.color }}
                  onClick={() => setOpenFacility(f.id)}
                >
                  <Icon size={16} />
                  <span>{f.title}</span>
                </button>
              );
            })}
          </div>
          {FACILITIES.filter((f) => f.id === openFacility).map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.id} className="facility-detail" style={{ '--chip': f.color }}>
                <div className="facility-detail-icon">
                  <Icon size={22} />
                </div>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.plain}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Journey */}
      <section className="home-journey home-reveal">
        <div className="home-section-header">
          <div className="section-tag">Your visit flow</div>
          <h2 className="section-heading">From arrival to going home</h2>
          <p className="section-subtext">Follow the steps — hover or tap each one.</p>
        </div>
        <div className="journey-track">
          {JOURNEY.map((step, idx) => (
            <button
              key={step.n}
              type="button"
              className={`journey-step ${activeJourney === idx ? 'active' : ''}`}
              onMouseEnter={() => setActiveJourney(idx)}
              onFocus={() => setActiveJourney(idx)}
              onClick={() => setActiveJourney(idx)}
            >
              <span className="journey-num">{step.n}</span>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Portals */}
      <section className="home-reveal">
        <div className="home-section-header">
          <div className="section-tag">Portals</div>
          <h2 className="section-heading">Choose how you enter</h2>
          <p className="section-subtext">
            {role
              ? 'Showing spaces for your signed-in role.'
              : 'Patients, doctors, and admins each have their own space. NGO and CSR sign in from the footer.'}
          </p>
        </div>

        <div className="modules-grid">
          {modules.map((mod) => (
            <div key={mod.id} className="module-box module-box-lift">
              <div>
                <div className="module-top-row">
                  <div className="module-icon-wrap" style={{ backgroundColor: mod.iconBg }}>
                    {mod.icon}
                  </div>
                  <span className="badge-step-tag">{mod.tag}</span>
                </div>
                <h3 className="module-title">{mod.title}</h3>
                <p className="module-desc">{mod.description}</p>
                <div className="module-points">
                  {mod.features.map((feat) => (
                    <div key={feat} className="module-point-item">
                      <CheckCircle2 size={14} color="#10b981" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Link to={mod.path} className="module-action-link">
                <span>{mod.buttonText}</span>
                <ChevronRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Partner strip */}
      <section className="home-partner-strip home-reveal">
        <div className="home-partner-copy">
          <Building2 size={20} />
          <div>
            <strong>Hospitals also need helping hands</strong>
            <p>NGOs register as organizations and offer volunteer teams. Companies support listed hospital needs. Use the footer links.</p>
          </div>
        </div>
        <div className="home-partner-icons">
          <span><Users size={16} /> NGO</span>
          <span><Gift size={16} /> CSR</span>
        </div>
      </section>

      <section className="home-kb-strip home-reveal">
        <div>
          <h3>Want the deeper story?</h3>
          <p>Knowledge base covers clinical grounding and project roadmap for reviewers and mentors.</p>
        </div>
        <Link to="/knowledge-base" className="btn btn-outline">
          Open knowledge base <ArrowRight size={14} />
        </Link>
      </section>
    </div>
  );
}
