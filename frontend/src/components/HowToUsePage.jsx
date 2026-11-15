import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BookOpen, Stethoscope, FileText, ShieldAlert,
  Tv, Users, Gift,
} from 'lucide-react';
import { HOW_TO_ROLES, HOW_THE_DAY_WORKS } from '../data/howToGuide';
import './HowToUsePage.css';

const ICONS = {
  patient: Stethoscope,
  doctor: FileText,
  admin: ShieldAlert,
  lobby: Tv,
  ngo: Users,
  csr: Gift,
};

export default function HowToUsePage() {
  const [roleId, setRoleId] = useState('patient');
  const rolePicked = useRef(false);

  const role = useMemo(
    () => HOW_TO_ROLES.find((r) => r.id === roleId) || HOW_TO_ROLES[0],
    [roleId],
  );
  const Icon = ICONS[role.id] || BookOpen;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!rolePicked.current) return;
    const el = document.getElementById('htu-steps');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [roleId]);

  const pickRole = (id) => {
    rolePicked.current = true;
    setRoleId(id);
  };

  return (
    <div className="htu-page">
      <header className="htu-hero">
        <div className="htu-hero-inner">
          <Link to="/" className="htu-back">
            <ArrowLeft size={14} /> Back to home
          </Link>
          <p className="htu-kicker">
            <BookOpen size={14} /> Simple guide
          </p>
          <h1>How to use this app</h1>
          <p className="htu-lead">
            Pick who you are. Then follow the numbered steps. Each step says what to do
            and where to click on the screen.
          </p>
        </div>
      </header>

      <section className="htu-plain-section">
        <h2 className="htu-plain-heading">The hospital day in 5 lines</h2>
        <p className="htu-plain-sub">
          Everyone shares one queue. The patient’s phone, the doctor’s screen, and the lobby TV stay together.
        </p>
        <ol className="htu-day-strip">
          {HOW_THE_DAY_WORKS.map((s) => (
            <li key={s.n}>
              <span>{s.n}</span>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="htu-plain-section">
        <h2 className="htu-plain-heading">Who are you?</h2>
        <p className="htu-plain-sub">Tap one. The steps below change for you.</p>
        <div className="htu-who-grid" role="tablist" aria-label="Who are you">
          {HOW_TO_ROLES.map((r) => {
            const RIcon = ICONS[r.id] || BookOpen;
            const active = r.id === roleId;
            return (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`htu-who-btn ${active ? 'active' : ''}`}
                  onClick={() => pickRole(r.id)}
              >
                <RIcon size={20} />
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="htu-plain-section htu-steps-panel" id="htu-steps">
        <div className="htu-steps-intro">
          <div className="htu-steps-icon">
            <Icon size={28} />
          </div>
          <div>
            <h2 className="htu-plain-heading" style={{ marginBottom: 6 }}>{role.label}</h2>
            <p className="htu-role-oneline">{role.oneLine}</p>
          </div>
          <Link to={role.path} className="htu-open-link">
            {role.button} <ArrowRight size={14} />
          </Link>
        </div>

        <ol className="htu-plain-steps">
          {role.steps.map((step, idx) => (
            <li key={`${role.id}-${idx}`}>
              <div className="htu-plain-num">{idx + 1}</div>
              <div className="htu-plain-body">
                <p className="htu-plain-do">{step.do}</p>
                <p className="htu-plain-screen">
                  <span>On the screen</span>
                  {step.screen}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="htu-steps-footer">
          <Link to={role.path} className="htu-open-link">
            Open this page now <ArrowRight size={14} />
          </Link>
          <Link to="/" className="htu-text-link">
            Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
