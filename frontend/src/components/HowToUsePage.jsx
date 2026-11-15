import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowLeft, BookOpen, Stethoscope, FileText, ShieldAlert,
  Tv, Users, Gift, ChevronRight, GitBranch, LayoutGrid,
} from 'lucide-react';
import { HOW_TO_JOURNEYS, HOW_TO_MODULES } from '../data/howToGuide';
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
  const [mode, setMode] = useState('workflows'); // workflows | modules
  const [journeyId, setJourneyId] = useState(HOW_TO_JOURNEYS[0].id);
  const [journeyStep, setJourneyStep] = useState(0);
  const [moduleId, setModuleId] = useState(HOW_TO_MODULES[0].id);
  const [moduleStep, setModuleStep] = useState(0);
  const [openTab, setOpenTab] = useState(0);

  const journey = useMemo(
    () => HOW_TO_JOURNEYS.find((j) => j.id === journeyId) || HOW_TO_JOURNEYS[0],
    [journeyId],
  );
  const journeyIndex = HOW_TO_JOURNEYS.findIndex((j) => j.id === journeyId);

  const mod = useMemo(
    () => HOW_TO_MODULES.find((m) => m.id === moduleId) || HOW_TO_MODULES[0],
    [moduleId],
  );
  const Icon = ICONS[mod.id] || BookOpen;
  const moduleIndex = HOW_TO_MODULES.findIndex((m) => m.id === moduleId);

  useEffect(() => {
    setJourneyStep(0);
  }, [journeyId]);

  useEffect(() => {
    setModuleStep(0);
    setOpenTab(0);
  }, [moduleId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const progressCount = mode === 'workflows' ? HOW_TO_JOURNEYS.length : HOW_TO_MODULES.length;
  const progressIndex = mode === 'workflows' ? journeyIndex : moduleIndex;
  const progressLabel = mode === 'workflows'
    ? `Workflow ${journeyIndex + 1} of ${HOW_TO_JOURNEYS.length} · ${journey.title}`
    : `Module ${moduleIndex + 1} of ${HOW_TO_MODULES.length} · ${mod.title}`;

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
            Start with the real hospital workflows — who does what, in what order, and how
            patient phone, doctor desk, lobby TV, and admin stay in sync. Modules are a reference
            for tabs after you understand the flow.
          </p>

          <div className="htu-mode-switch" role="tablist" aria-label="Guide mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'workflows'}
              className={`htu-mode-btn ${mode === 'workflows' ? 'active' : ''}`}
              onClick={() => setMode('workflows')}
            >
              <GitBranch size={15} /> Workflows first
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'modules'}
              className={`htu-mode-btn ${mode === 'modules' ? 'active' : ''}`}
              onClick={() => setMode('modules')}
            >
              <LayoutGrid size={15} /> Module tabs
            </button>
          </div>

          <div className="htu-progress" aria-hidden="true">
            <div
              className="htu-progress-fill"
              style={{ width: `${((progressIndex + 1) / progressCount) * 100}%` }}
            />
          </div>
          <p className="htu-progress-label">{progressLabel}</p>
        </div>
      </header>

      {mode === 'workflows' ? (
        <div className="htu-layout">
          <aside className="htu-rail" aria-label="Workflows">
            <p className="htu-rail-label">End-to-end workflows</p>
            <nav className="htu-rail-nav">
              {HOW_TO_JOURNEYS.map((item, idx) => {
                const active = item.id === journeyId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`htu-rail-btn ${active ? 'active' : ''}`}
                    onClick={() => setJourneyId(item.id)}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="htu-rail-index">{String(idx + 1).padStart(2, '0')}</span>
                    <span className="htu-rail-copy">
                      <strong>{item.title}</strong>
                      <em>{item.actors.join(' · ')}</em>
                    </span>
                    <GitBranch size={16} className="htu-rail-icon" />
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="htu-stage" key={journey.id}>
            <div className="htu-stage-head">
              <div className="htu-stage-icon">
                <GitBranch size={26} />
              </div>
              <div className="htu-stage-titles">
                <h2>{journey.title}</h2>
                <p>{journey.summary}</p>
                <div className="htu-actors">
                  {journey.actors.map((a) => (
                    <span key={a}>{a}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="htu-journey-grid">
              <div className="htu-block">
                <div className="htu-block-head">
                  <h3>Steps</h3>
                  <span>{journeyStep + 1} / {journey.steps.length}</span>
                </div>
                <ol className="htu-steps">
                  {journey.steps.map((step, idx) => (
                    <li key={step.title}>
                      <button
                        type="button"
                        className={`htu-step ${journeyStep === idx ? 'active' : ''} ${idx < journeyStep ? 'done' : ''}`}
                        onClick={() => setJourneyStep(idx)}
                      >
                        <span className="htu-step-num">{idx + 1}</span>
                        <span className="htu-step-text">{step.title}</span>
                        <ChevronRight size={14} className="htu-step-chevron" />
                      </button>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="htu-block htu-focus-stack">
                <div className="htu-step-focus" aria-live="polite">
                  <strong>What happens</strong>
                  <h4>{journey.steps[journeyStep].title}</h4>
                  <p>{journey.steps[journeyStep].detail}</p>
                </div>
                <div className="htu-sync-card">
                  <strong>Sync across screens</strong>
                  <p>{journey.steps[journeyStep].sync}</p>
                </div>
              </div>
            </div>

            <div className="htu-footer-nav">
              <button
                type="button"
                className="htu-nav-btn"
                onClick={() => journeyIndex > 0 && setJourneyId(HOW_TO_JOURNEYS[journeyIndex - 1].id)}
                disabled={journeyIndex === 0}
              >
                <ArrowLeft size={14} /> Previous workflow
              </button>
              <button
                type="button"
                className="htu-nav-btn primary"
                onClick={() => {
                  if (journeyIndex < HOW_TO_JOURNEYS.length - 1) {
                    setJourneyId(HOW_TO_JOURNEYS[journeyIndex + 1].id);
                  } else {
                    setMode('modules');
                  }
                }}
              >
                {journeyIndex < HOW_TO_JOURNEYS.length - 1 ? (
                  <>Next workflow <ArrowRight size={14} /></>
                ) : (
                  <>Browse module tabs <ArrowRight size={14} /></>
                )}
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="htu-layout">
          <aside className="htu-rail" aria-label="Modules">
            <p className="htu-rail-label">Module reference</p>
            <nav className="htu-rail-nav">
              {HOW_TO_MODULES.map((item, idx) => {
                const ItemIcon = ICONS[item.id] || BookOpen;
                const active = item.id === moduleId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`htu-rail-btn ${active ? 'active' : ''}`}
                    onClick={() => setModuleId(item.id)}
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
                <h2>{mod.title} module</h2>
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
                  <h3>Role workflow</h3>
                  <span>Step {moduleStep + 1} / {mod.workflow.length}</span>
                </div>
                <ol className="htu-steps">
                  {mod.workflow.map((step, idx) => (
                    <li key={step}>
                      <button
                        type="button"
                        className={`htu-step ${moduleStep === idx ? 'active' : ''} ${idx < moduleStep ? 'done' : ''}`}
                        onClick={() => setModuleStep(idx)}
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
                  <p>{mod.workflow[moduleStep]}</p>
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
              <button
                type="button"
                className="htu-nav-btn"
                onClick={() => {
                  if (moduleIndex === 0) setMode('workflows');
                  else setModuleId(HOW_TO_MODULES[moduleIndex - 1].id);
                }}
              >
                <ArrowLeft size={14} /> {moduleIndex === 0 ? 'Back to workflows' : 'Previous module'}
              </button>
              <button
                type="button"
                className="htu-nav-btn primary"
                onClick={() => moduleIndex < HOW_TO_MODULES.length - 1 && setModuleId(HOW_TO_MODULES[moduleIndex + 1].id)}
                disabled={moduleIndex === HOW_TO_MODULES.length - 1}
              >
                Next module <ArrowRight size={14} />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
