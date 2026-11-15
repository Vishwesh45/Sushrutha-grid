import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Stethoscope, FileText, ShieldAlert, Tv, Database, ArrowRight,
  Heart, CheckCircle2, Mic, MapPin, Ticket, ClipboardList,
  Users, Gift, KeyRound, Star, ChevronRight,
  Activity, Building2, HandHeart, BookOpen
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

/** First-time user guide — mirrors live tabs/workflows in each module */
const HOW_TO_MODULES = [
  {
    id: 'patient',
    title: 'Patient',
    path: '/patient',
    cta: 'Open patient care',
    icon: Stethoscope,
    color: '#c4161c',
    who: 'Anyone seeking OPD care at a government hospital in the grid.',
    start: 'Tap “I am a patient”, register or sign in, then use the bottom tabs: Home · Care · Find · Me.',
    workflow: [
      'Sign in (or register) so your token and prescriptions stay with you.',
      'Care → Consult: type or speak symptoms. The app suggests department + GREEN/AMBER/RED urgency.',
      'Find → Nearby / Live OPD: pick a hospital; Find → Desk code: check in at reception when you arrive.',
      'Take / confirm your OPD token, then wait on Home — phone updates when the chamber calls you.',
      'After the visit: open the digital prescription from Home or Me → Records; optionally leave a review.',
    ],
    tabs: [
      {
        name: 'Home',
        detail: 'Live visit summary: active token, call alerts, and quick links to your latest Rx when ready.',
      },
      {
        name: 'Care → Consult',
        detail: 'Main intake: voice (Whisper) or typed complaint, triage colour, department routing, then token flow.',
      },
      {
        name: 'Care → Ask',
        detail: 'Simple assistant for common hospital questions during your visit.',
      },
      {
        name: 'Care → Follow-ups',
        detail: 'Reminders the doctor may leave (return date / advice). Badge shows when something is due.',
      },
      {
        name: 'Find → Nearby',
        detail: 'GPS / map of nearby government hospitals (live OSM + distance).',
      },
      {
        name: 'Find → Live OPD',
        detail: 'See which digital OPD sessions are active so you know where tokens are running.',
      },
      {
        name: 'Find → Desk code',
        detail: 'Enter the short reception code before digital OPD check-in (admin publishes this code).',
      },
      {
        name: 'Me → Records',
        detail: 'Past consultations and printable digital prescriptions.',
      },
      {
        name: 'Me → Reviews',
        detail: 'Rate facility, department, doctor, and waiting area after a visit.',
      },
    ],
  },
  {
    id: 'doctor',
    title: 'Doctor',
    path: '/doctor',
    cta: 'Open doctor desk',
    icon: FileText,
    color: '#059669',
    who: 'OPD doctors signed in with a doctor account linked to the hospital roster.',
    start: 'Open Doctor desk, sign in, confirm your department/chamber. Use Queue · Prescription · Completed.',
    workflow: [
      'Patients with tokens appear in your chamber queue (WAITING).',
      'Call next in line only (no skipping ahead) — status becomes CALLED; lobby TV + patient phone update.',
      'Start consultation → IN_CONSULTATION. Skip/rejoin is available when someone does not respond.',
      'Write the digital prescription (medicines, advice, follow-up text) and complete the visit → COMPLETED.',
      'Patient sees the Rx in their app; you can review completed tokens on the Completed tab.',
    ],
    tabs: [
      {
        name: 'Queue',
        detail: 'Live board: WAITING → CALLED → IN_CONSULTATION → COMPLETED (plus SKIPPED). Call next, start consult, skip.',
      },
      {
        name: 'Digital prescription',
        detail: 'Opens for the patient in consultation: medicine rows, advice, follow-up notes; issues the Rx slip.',
      },
      {
        name: 'Completed',
        detail: 'Today’s finished tokens for that chamber — reopen context if you need to confirm what was written.',
      },
    ],
  },
  {
    id: 'admin',
    title: 'Hospital admin',
    path: '/admin',
    cta: 'Open admin center',
    icon: ShieldAlert,
    color: '#1d4ed8',
    who: 'Hospital operations staff who manage roster, floor codes, partners, and day-end insights.',
    start: 'Sign in as admin. Use the side menu (or mobile hamburger): Floor ops · Partners · Insights.',
    workflow: [
      'Reception: publish today’s desk check-in code so patients can verify at the counter.',
      'Doctors: keep the OPD roster current (department, room, shift, AVAILABLE / BUSY / OFF).',
      'OPD queue: watch token volumes and department load for the day.',
      'NGO / Volunteers: post needs; Accept NGO applications from the inbox.',
      'CSR funding: post equipment lists; Accept company interests → pledge → Mark fulfilled when items arrive.',
      'Performance + Decisions today: read hospital vs doctor ratings and clear ops numbers — not vanity charts.',
    ],
    tabs: [
      {
        name: 'Reception',
        detail: 'Desk code for patient check-in before digital OPD.',
      },
      {
        name: 'Doctors',
        detail: 'Full roster: add/edit doctors, rooms, shifts, employment type, live status.',
      },
      {
        name: 'OPD queue',
        detail: 'Token analytics — today / date / month filters by department.',
      },
      {
        name: 'Beds',
        detail: 'Ward bed occupancy snapshot (live counts, not a static preview).',
      },
      {
        name: 'NGO / Volunteers',
        detail: 'Subtabs: post hospital volunteer needs · Check NGO applications (Accept / Reject / Deploy).',
      },
      {
        name: 'CSR funding',
        detail: 'Subtabs: Requirements lists · Company Interests (Accept → CSR_PLEDGED, then Fulfill). Offline Record Pledge still available.',
      },
      {
        name: 'Decisions today',
        detail: 'Clear operational numbers for the shift (roster + OPD aggregates).',
      },
      {
        name: 'Performance',
        detail: 'Hospital | Doctors views from patient ratings, with alerts and CSV export for doctor rows.',
      },
      {
        name: 'Audit log',
        detail: 'Hospital events and sessions for accountability.',
      },
    ],
  },
  {
    id: 'lobby',
    title: 'Lobby TV',
    path: '/lobby-display',
    cta: 'Open lobby screen',
    icon: Tv,
    color: '#7c3aed',
    who: 'Waiting-hall display (tablet/TV browser). No patient login required.',
    start: 'Open Lobby waiting screen on a large display facing the OPD seating area.',
    workflow: [
      'Keep the page open — it listens to the same live hospital channel as phones and the doctor desk.',
      'When a doctor Calls a token, the board shows “now calling” with room guidance and a chime.',
      'Patients hear/see the cue and walk to the chamber; staff do not need to shout numbers.',
    ],
    tabs: [
      {
        name: 'Now calling',
        detail: 'Large token number + department/room when status is CALLED.',
      },
      {
        name: 'Sound cue',
        detail: 'Chime on new call events so the hall notices without staring at the screen.',
      },
      {
        name: 'Room guide',
        detail: 'Chamber / room text so people know where to walk.',
      },
    ],
  },
  {
    id: 'ngo',
    title: 'NGO volunteers',
    path: '/volunteer',
    cta: 'Open NGO portal',
    icon: Users,
    color: '#be123c',
    who: 'Registered NGO organizations offering volunteer teams (footer → NGO).',
    start: 'Register/sign in as volunteer/NGO. Browse hospital openings and apply as an organization.',
    workflow: [
      'Admin posts a volunteer requisition (people needed, shift, days).',
      'NGO portal lists openings by hospital — apply with team size, skills, and contact.',
      'Admin Checks applications: Accept → Deploy when the team is on site.',
      'Your application status updates live when admin acts.',
    ],
    tabs: [
      {
        name: 'Hospital openings',
        detail: 'Live requisitions from admin (department, headcount, duration).',
      },
      {
        name: 'Apply',
        detail: 'Submit NGO application against a specific requisition.',
      },
      {
        name: 'My applications',
        detail: 'Track PENDING / ACCEPTED / REJECTED / DEPLOYED.',
      },
    ],
  },
  {
    id: 'csr',
    title: 'CSR companies',
    path: '/csr',
    cta: 'Open CSR portal',
    icon: Gift,
    color: '#c2410c',
    who: 'Corporate / foundation CSR accounts (footer → CSR).',
    start: 'Register/sign in as CSR. Company name is your account; liaison can sit in the contact field.',
    workflow: [
      'Admin posts a multi-item equipment requirement (POSTED).',
      'CSR portal: Express interest (does not lock the list — several companies may apply).',
      'Admin Company Interests: Accept one → requirement becomes CSR_PLEDGED; other pending interests are rejected.',
      'When goods arrive, admin Marks Fulfilled. Watch My interests for ACCEPTED / REJECTED.',
    ],
    tabs: [
      {
        name: 'Hospital requirements',
        detail: 'Posted funding lists with items, priority, and target cost.',
      },
      {
        name: 'Express interest',
        detail: 'Non-locking interest with indicative amount and notes.',
      },
      {
        name: 'My interests',
        detail: 'Your PENDING / ACCEPTED / REJECTED history synced with admin decisions.',
      },
    ],
  },
];

export default function HomePage() {
  const { isConnected } = useHospitalWebSocket();
  const { user, isAuthenticated, loading } = useAuth();
  const role = isAuthenticated ? user?.role : null;
  const [openFacility, setOpenFacility] = useState('voice');
  const [activeJourney, setActiveJourney] = useState(0);
  const [howToModule, setHowToModule] = useState('patient');

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
            <>
              <a href="#how-to-use" className="hero-btn-secondary">
                <BookOpen size={18} />
                <span>How to use it</span>
              </a>
              <Link to="/knowledge-base" className="hero-btn-secondary">
                <Database size={18} />
                <span>Learn more</span>
              </Link>
            </>
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

      {/* How to use it — first-time guide */}
      <section className="home-howto home-reveal" id="how-to-use">
        <div className="home-section-header">
          <div className="section-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <BookOpen size={14} /> How to use it
          </div>
          <h2 className="section-heading">First time here? Read this before you sign in</h2>
          <p className="section-subtext">
            Pick a role below. Each panel explains who it is for, the real workflow, and every live tab —
            so patients, doctors, admin, lobby TV, NGO, and CSR teams all know where to click.
          </p>
        </div>

        <div className="howto-shell">
          <div className="howto-quickstart">
            <strong>Quick start</strong>
            <ol>
              <li>Choose your role on this page (or use the footer for NGO / CSR).</li>
              <li>Register once, then sign in — you land in your workspace, not this marketing page.</li>
              <li>On phones, open the menu (☰) for the same tabs as the desktop side bar.</li>
              <li>Screens stay in sync: patient phone, doctor desk, lobby TV, and admin update together when a token moves.</li>
            </ol>
          </div>

          <div className="howto-module-chips" role="tablist" aria-label="How to use by role">
            {HOW_TO_MODULES.map((mod) => {
              const Icon = mod.icon;
              const active = howToModule === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`howto-chip ${active ? 'active' : ''}`}
                  style={{ '--howto': mod.color }}
                  onClick={() => setHowToModule(mod.id)}
                >
                  <Icon size={15} />
                  <span>{mod.title}</span>
                </button>
              );
            })}
          </div>

          {HOW_TO_MODULES.filter((m) => m.id === howToModule).map((mod) => {
            const Icon = mod.icon;
            return (
              <div key={mod.id} className="howto-panel" style={{ '--howto': mod.color }}>
                <div className="howto-panel-head">
                  <div className="howto-panel-icon">
                    <Icon size={22} />
                  </div>
                  <div className="howto-panel-intro">
                    <h3>{mod.title} module</h3>
                    <p><span className="howto-label">Who</span> {mod.who}</p>
                    <p><span className="howto-label">Start</span> {mod.start}</p>
                  </div>
                  <Link to={mod.path} className="howto-cta">
                    {mod.cta} <ArrowRight size={14} />
                  </Link>
                </div>

                <div className="howto-columns">
                  <div className="howto-col">
                    <h4>Workflow</h4>
                    <ol className="howto-steps">
                      {mod.workflow.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="howto-col">
                    <h4>Tabs & features</h4>
                    <ul className="howto-tabs">
                      {mod.tabs.map((tab) => (
                        <li key={tab.name}>
                          <strong>{tab.name}</strong>
                          <span>{tab.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
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
