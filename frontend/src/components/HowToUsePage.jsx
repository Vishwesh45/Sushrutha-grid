import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowLeft, BookOpen, Stethoscope, FileText, ShieldAlert,
  Tv, Users, Gift, ChevronRight,
} from 'lucide-react';
import { HOW_TO_MODULES } from '../data/howToGuide';
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
  const [activeId, setActiveId] = useState(HOW_TO_MODULES[0].id);
  const [activeStep, setActiveStep] = useState(0);
  const [openTab, setOpenTab] = useState(0);

  const mod = useMemo(
    () => HOW_TO_MODULES.find((m) => m.id === activeId) || HOW_TO_MODULES[0],
    [activeId],
  );
  const Icon = ICONS[mod.id] || BookOpen;
  const activeIndex = HOW_TO_MODULES.findIndex((m) => m.id === activeId);

  useEffect(() => {
    setActiveStep(0);
    setOpenTab(0);
  }, [activeId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goPrev = () => {
    if (activeIndex <= 0) return;
    setActiveId(HOW_TO_MODULES[activeIndex - 1].id);
  };

  const goNext = () => {
    if (activeIndex >= HOW_TO_MODULES.length - 1) return;
    setActiveId(HOW_TO_MODULES[activeIndex + 1].id);
  };

  return (
    <div className="htu-page">
      <header className="htu-hero">
        <div className="htu-hero-inner">
          <Link to="/" className="htu-back">
            <ArrowLeft size={14} /> Back to home
          </Link>
          <p className="htu-kicker">
            <BookOpen size={14} /> Operator guide
          </p>
          <h1>How to use Sushrutha Grid</h1>
          <p className="htu-lead">
            A dedicated walkthrough for first-time users — every module, every live tab,
            and the exact workflow from sign-in to prescription, partners, and lobby TV.
          </p>
          <div className="htu-progress" aria-hidden="true">
            <div
              className="htu-progress-fill"
              style={{ width: `${((activeIndex + 1) / HOW_TO_MODULES.length) * 100}%` }}
            />
          </div>
          <p className="htu-progress-label">
            Module {activeIndex + 1} of {HOW_TO_MODULES.length} · {mod.title}
          </p>
        </div>
      </header>

      <div className="htu-layout">
        <aside className="htu-rail" aria-label="Modules">
          <p className="htu-rail-label">Choose a module</p>
          <nav className="htu-rail-nav">
            {HOW_TO_MODULES.map((item, idx) => {
              const ItemIcon = ICONS[item.id] || BookOpen;
              const active = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`htu-rail-btn ${active ? 'active' : ''}`}
                  onClick={() => setActiveId(item.id)}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="htu-rail-index">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="htu-rail-copy">
                    <strong>{item.title}</strong>
                    <em>{item.path}</em>
                  </span>
                  <ItemIcon size={16} className="htu-rail-icon" />
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="htu-stage" key={mod.id}>
          <div className="htu-stage-head">
            <div className="htu-stage-icon">
              <Icon size={26} />
            </div>
            <div className="htu-stage-titles">
              <h2>{mod.title}</h2>
              <p><span>Who</span> {mod.who}</p>
              <p><span>Start</span> {mod.start}</p>
            </div>
            <Link to={mod.path} className="htu-open-link">
              {mod.cta} <ArrowRight size={14} />
            </Link>
          </div>

          <div className="htu-grid">
            <div className="htu-block">
              <div className="htu-block-head">
                <h3>Workflow</h3>
                <span>Step {activeStep + 1} / {mod.workflow.length}</span>
              </div>
              <ol className="htu-steps">
                {mod.workflow.map((step, idx) => (
                  <li key={step}>
                    <button
                      type="button"
                      className={`htu-step ${activeStep === idx ? 'active' : ''} ${idx < activeStep ? 'done' : ''}`}
                      onClick={() => setActiveStep(idx)}
                    >
                      <span className="htu-step-num">{idx + 1}</span>
                      <span className="htu-step-text">{step}</span>
                      <ChevronRight size={14} className="htu-step-chevron" />
                    </button>
                  </li>
                ))}
              </ol>
              <div className="htu-step-focus" aria-live="polite">
                <strong>Focus</strong>
                <p>{mod.workflow[activeStep]}</p>
              </div>
            </div>

            <div className="htu-block">
              <div className="htu-block-head">
                <h3>Tabs & features</h3>
                <span>{mod.tabs.length} surfaces</span>
              </div>
              <ul className="htu-tabs">
                {mod.tabs.map((tab, idx) => {
                  const open = openTab === idx;
                  return (
                    <li key={tab.name}>
                      <button
                        type="button"
                        className={`htu-tab ${open ? 'open' : ''}`}
                        onClick={() => setOpenTab(open ? -1 : idx)}
                        aria-expanded={open}
                      >
                        <span className="htu-tab-name">{tab.name}</span>
                        <ChevronRight size={14} className={`htu-tab-chevron ${open ? 'open' : ''}`} />
                      </button>
                      <div className={`htu-tab-body ${open ? 'open' : ''}`}>
                        <p>{tab.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="htu-footer-nav">
            <button type="button" className="htu-nav-btn" onClick={goPrev} disabled={activeIndex === 0}>
              <ArrowLeft size={14} /> Previous module
            </button>
            <button type="button" className="htu-nav-btn primary" onClick={goNext} disabled={activeIndex === HOW_TO_MODULES.length - 1}>
              Next module <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
