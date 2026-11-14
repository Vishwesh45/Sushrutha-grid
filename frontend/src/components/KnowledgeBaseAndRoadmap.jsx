import React, { useState } from 'react';
import KnowledgeBaseExplorer from './KnowledgeBaseExplorer';
import { Layers, Database, ShieldAlert, CheckCircle2 } from 'lucide-react';

const PHASES = [
  {
    id: 1,
    title: 'Foundation & Database Connectivity',
    detail: 'FastAPI ASGI server, PyMongo client, local MongoDB (sushrutha_grid), React + Vite with Axios interceptors.',
    tag: 'VERIFIED',
  },
  {
    id: 2,
    title: 'Authentication & Multi-Role RBAC',
    detail: 'bcrypt + JWT sessions, patient/doctor/admin live roles, idle heartbeat, role-gated routing (patient cannot open staff portals without sign-out).',
    tag: 'VERIFIED',
  },
  {
    id: 3,
    title: 'Patient Intake & Storage Pipeline',
    detail: 'Digital intake, severity + duration autofill, consultations persistence, reception check-in gate, operational hospital_events auditing.',
    tag: 'VERIFIED',
  },
  {
    id: 4,
    title: 'Voice Input & Whisper Speech-to-Text',
    detail: 'Browser MediaRecorder, POST /api/speech/transcribe, local Whisper base (auto language detect; clinical NLP remains English/Hinglish-first).',
    tag: 'VERIFIED',
  },
  {
    id: 5,
    title: 'Clinical Knowledge Corpus & Semantic NLP',
    detail: 'Rules-based clinical NLP on CUMC/SymCat corpus + NegEx; Rotterdam 2003 PCOD/PCOS clusters (E28.2) with OB-GYN routing and 5-test workup — not a fine-tuned LLM.',
    tag: 'ACTIVE & VERIFIED',
  },
  {
    id: 6,
    title: 'Doctor Clinical Chamber Desk & Digital Rx',
    detail: '42-doctor roster, sequential queue call, structured Rx builder, branded PDF/HTML download, follow-up date on prescribe.',
    tag: 'ACTIVE & VERIFIED',
  },
  {
    id: 7,
    title: 'Real-Time Hospital Event Bus',
    detail: 'Native WebSocket /ws/hospital, token call chimes, lobby/reception displays, multi-page client routing.',
    tag: 'ACTIVE & VERIFIED',
  },
  {
    id: 8,
    title: 'Nearby Hospitals + Google Maps XAI',
    detail: 'Live GPS discovery with Google ratings/reviews, timings, contact, services, and explainable review-based summaries for government hospitals.',
    tag: 'ACTIVE & VERIFIED',
  },
  {
    id: 9,
    title: 'Structured Ratings, Reviews & Admin XAI',
    detail: 'Facility/department/doctor/ward RYG ratings, emergency ≤2★ lookup, department→nested doctors analytics with XAI narratives (Recharts).',
    tag: 'ACTIVE & VERIFIED',
  },
  {
    id: 10,
    title: 'Follow-up Appointments & Reminders',
    detail: 'Next appointment date from Rx, day-before + day-of in-app reminders, patient Follow-ups tab, background poller + WebSocket nudge.',
    tag: 'ACTIVE & VERIFIED',
  },
];

export default function KnowledgeBaseAndRoadmap() {
  const [subTab, setSubTab] = useState('ontology');

  return (
    <div style={{ width: '100%', padding: '20px 24px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setSubTab('ontology')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.88rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: subTab === 'ontology' ? '#c4161c' : '#f1f5f9',
            color: subTab === 'ontology' ? '#ffffff' : '#475569'
          }}
        >
          <Database size={16} /> Knowledge Corpus (CUMC / SymCat / Rotterdam PCOD)
        </button>

        <button
          type="button"
          onClick={() => setSubTab('roadmap')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.88rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: subTab === 'roadmap' ? '#c4161c' : '#f1f5f9',
            color: subTab === 'roadmap' ? '#ffffff' : '#475569'
          }}
        >
          <Layers size={16} /> MCA Capstone Phased Implementation Matrix
        </button>
      </div>

      {subTab === 'ontology' ? (
        <KnowledgeBaseExplorer />
      ) : (
        <div className="card roadmap-card-modern">
          <div className="card-top-header">
            <div className="badge-step-tag">
              <Layers size={14} className="tag-icon" />
              <span>MCA CAPSTONE PROJECT • RESEARCH GROUNDING</span>
            </div>
            <h2 className="section-title">Phased Implementation & Research Matrix</h2>
            <p className="section-desc">
              Phases 1–10 verified in this build. Clinical NLP remains rules-based on the project corpus (not a retrained neural model).
            </p>
          </div>

          <div className="academic-highlight-box">
            <ShieldAlert size={20} className="highlight-icon" />
            <div>
              <strong>Academic Research Component (Approved by Guide/Faculty):</strong>
              <p>
                Phase 5 uses established biomedical grounding — <strong>Columbia CUMC</strong>, <strong>CDC SymCat</strong>,
                <strong> NegEx</strong>, and <strong>Rotterdam 2003 PCOS consensus</strong> — rather than synthetic memorized datasets.
                PCOD/PCOS routing to Obstetrics &amp; Gynecology (ICD-10 E28.2) is implemented in the project NLP service and indexed in the knowledge corpus.
              </p>
            </div>
          </div>

          <div className="roadmap-phases-list">
            {PHASES.map((p) => (
              <div key={p.id} className="phase-row phase-complete">
                <div className="phase-status-badge">
                  <CheckCircle2 size={18} className="text-emerald" />
                  <span>PHASE {p.id}</span>
                </div>
                <div className="phase-details">
                  <strong>{p.title}</strong>
                  <p>{p.detail}</p>
                </div>
                <span className="phase-tag tag-verified">{p.tag}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
