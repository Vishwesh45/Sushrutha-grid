import React, { useEffect, useState } from 'react';
import { MessageCircle, Send, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import api from '../services/api';

const CHIPS = [
  'What medicines are on this prescription?',
  'When should I take my tablets?',
  'I missed a dose — what does my slip say?',
  'When is my follow-up?',
  'What tests did the doctor advise?',
  'What is my token / queue status?',
];

export default function PatientAssistantPanel() {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState({ llm_configured: false, provider: '—' });
  const [visitOptions, setVisitOptions] = useState([]);
  const [focusedRx, setFocusedRx] = useState(null);

  useEffect(() => {
    api.get('/patient/assistant/status')
      .then((res) => setStatus(res.data || {}))
      .catch(() => setStatus({ llm_configured: false }));
  }, []);

  const ask = async (text, rxOverride = undefined) => {
    const q = (text || question).trim();
    if (!q || busy) return;
    const focus = rxOverride !== undefined ? rxOverride : focusedRx;
    setBusy(true);
    setQuestion('');
    const nextHistory = [...messages, { role: 'user', text: q }].slice(-6);
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    try {
      const res = await api.post('/patient/assistant/ask', {
        question: q,
        prescription_id: focus || undefined,
        history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
      });
      const data = res.data || {};
      if (Array.isArray(data.visit_options) && data.visit_options.length) {
        setVisitOptions(data.visit_options);
      }
      if (data.focused_prescription_id) {
        setFocusedRx(data.focused_prescription_id);
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.answer,
          meta: {
            allowed: data.allowed,
            source: data.source,
            used_llm: data.used_llm,
            context_used: data.context_used || [],
            needs_visit_pick: data.needs_visit_pick,
            focused: data.focused_prescription_id,
          },
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: err.response?.data?.detail || 'Could not reach the helper. Try again.',
          meta: { allowed: false, source: 'error' },
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const pickVisit = (opt) => {
    setFocusedRx(opt.prescription_id);
    ask(`Please use my visit: ${opt.label}`, opt.prescription_id);
  };

  return (
    <div className="patient-panel patient-assistant">
      <div className="patient-assistant-head">
        <div>
          <h2><MessageCircle size={18} /> Ask about my visit</h2>
          <p className="panel-lead">
            Natural answers from your own slips — pick a visit if you have more than one.
          </p>
        </div>
        <span className={`patient-assistant-badge ${status.llm_configured ? 'on' : 'off'}`}>
          <Sparkles size={12} />
          {status.llm_configured ? `LLM on (${status.provider})` : 'Rules mode (add API key for LLM)'}
        </span>
      </div>

      <div className="patient-assistant-guard">
        <ShieldAlert size={14} />
        Rules block diagnoses, remedies, dose changes, and general medical chat. Emergency → call 108.
      </div>

      {visitOptions.length > 0 && (
        <div className="patient-assistant-visits">
          <div className="patient-assistant-visits-label">Your treatment records</div>
          <div className="patient-assistant-chips">
            {visitOptions.map((v) => (
              <button
                key={v.prescription_id}
                type="button"
                className={`patient-assistant-chip visit ${focusedRx === v.prescription_id ? 'selected' : ''}`}
                onClick={() => pickVisit(v)}
                disabled={busy}
              >
                {v.label}
              </button>
            ))}
            {focusedRx && (
              <button
                type="button"
                className="patient-assistant-chip"
                onClick={() => setFocusedRx(null)}
                disabled={busy}
              >
                Clear focus
              </button>
            )}
          </div>
        </div>
      )}

      <div className="patient-assistant-chips">
        {CHIPS.map((c) => (
          <button key={c} type="button" className="patient-assistant-chip" onClick={() => ask(c)} disabled={busy}>
            {c}
          </button>
        ))}
      </div>

      <div className="patient-assistant-thread" aria-live="polite">
        {messages.length === 0 && (
          <p className="patient-assistant-empty">
            Ask about medicines, dose, missed dose, or follow-up. If you have several visits, choose one first.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`patient-assistant-bubble ${m.role}`}>
            <div className="patient-assistant-text">{m.text}</div>
            {m.role === 'assistant' && m.meta && (
              <div className="patient-assistant-meta">
                {m.meta.allowed === false ? 'Blocked by rules' : 'In scope'}
                {m.meta.used_llm ? ' · LLM' : ` · ${m.meta.source || 'rules'}`}
                {m.meta.focused ? ` · ${m.meta.focused}` : ''}
                {m.meta.needs_visit_pick ? ' · pick a visit' : ''}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        className="patient-assistant-compose"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={focusedRx ? `Ask about ${focusedRx}…` : 'e.g. When do I take the evening tablet?'}
          maxLength={500}
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !question.trim()}>
          {busy ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}
