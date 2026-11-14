import React, { useState, useEffect } from 'react';
import { 
  Tv, Volume2, VolumeX, Clock, Stethoscope, AlertCircle, 
  CheckCircle2, ArrowRight, Activity, Users, ShieldAlert, Sparkles
} from 'lucide-react';
import api from '../services/api';
import { useHospitalWebSocket, playHospitalChime } from '../services/useHospitalWebSocket';

const OPERATIONAL_HOSPITAL_ID = 'HOSP-BLR-001';
const OPERATIONAL_HOSPITAL_NAME = 'Victoria Hospital (BMCRI Apex Medical Center)';

export default function LobbyDisplayPage() {
  const [activeCall, setActiveCall] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [queueSummary, setQueueSummary] = useState([]);
  const [rosterDoctors, setRosterDoctors] = useState([]);
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [callFlash, setCallFlash] = useState(false);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch live queue tokens and real Victoria Hospital doctor roster
  const fetchLobbyData = async () => {
    try {
      const [queueRes, docsRes] = await Promise.all([
        api.get(`/queue/live?hospital_id=${OPERATIONAL_HOSPITAL_ID}`),
        api.get(`/doctors/?hospital_id=${OPERATIONAL_HOSPITAL_ID}`)
      ]);

      const tokens = Array.isArray(queueRes.data)
        ? queueRes.data
        : (queueRes.data?.tokens || []);
      setQueueSummary(tokens);

      // Populate currently called token banner from live database if none set yet
      const calledTokens = tokens.filter((t) => t.status === 'CALLED');
      if (calledTokens.length > 0) {
        const latestCalled = calledTokens[0];
        setActiveCall((prev) => prev || {
          token_number: latestCalled.token_number,
          patient_name: latestCalled.patient_name || 'Patient',
          room_number: latestCalled.assigned_room || 'OPD Chamber',
          doctor_name: latestCalled.assigned_doctor_name || 'Medical Officer',
          department: latestCalled.department || 'Outpatient Department',
          called_at: latestCalled.called_at
            ? new Date(latestCalled.called_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        });
      }

      if (docsRes.data?.data) {
        setRosterDoctors(docsRes.data.data);
      }
    } catch (err) {
      // Offline fallback
    }
  };

  useEffect(() => {
    fetchLobbyData();
    const interval = setInterval(fetchLobbyData, 12000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket real-time event listener scoped to operational hospital HOSP-BLR-001
  const { isConnected } = useHospitalWebSocket((eventPayload) => {
    const { event, data } = eventPayload;
    if (data?.hospital_id && data.hospital_id !== OPERATIONAL_HOSPITAL_ID) {
      return;
    }

    if (event === 'TOKEN_CALLED') {
      setActiveCall({
        token_number: data.token_number,
        patient_name: data.patient_name || 'Patient',
        room_number: data.room_number || 'OPD Chamber',
        doctor_name: data.doctor_name || 'Medical Officer',
        department: data.department || 'Outpatient Department',
        called_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });

      // Trigger visual flash
      setCallFlash(true);
      setTimeout(() => setCallFlash(false), 8000);

      // Play audio chime if enabled
      if (audioEnabled) {
        playHospitalChime('call');
      }

      // Add to recent call history
      setCallHistory((prev) => [
        {
          token_number: data.token_number,
          room_number: data.room_number,
          doctor_name: data.doctor_name,
          department: data.department,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
        ...prev.slice(0, 5)
      ]);

      fetchLobbyData();
    } else if (
      event === 'TOKEN_ISSUED' ||
      event === 'CONSULTATION_STARTED' ||
      event === 'CONSULTATION_COMPLETED' ||
      event === 'PATIENT_SKIPPED' ||
      event === 'TOKEN_REJOINED' ||
      event === 'PRESCRIPTION_ISSUED' ||
      event === 'DOCTOR_STATUS_UPDATED' ||
      event === 'DOCTOR_ROSTER_UPDATED'
    ) {
      fetchLobbyData();
    }
  });

  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 54px)', background: '#0b1120', color: '#f8fafc', padding: '24px 32px', boxSizing: 'border-box', overflowY: 'auto' }}>
      
      {/* 1. TV Screen Header Strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1e293b', paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '48px', height: '48px', background: '#c4161c', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: 900, color: '#fff' }}>
            +
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffffff', letterSpacing: '0.5px', margin: 0 }}>
              {OPERATIONAL_HOSPITAL_NAME} • OPD Waiting Lobby Display
            </h1>
            <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '0.86rem' }}>
              Tenant ID: {OPERATIONAL_HOSPITAL_ID} • Real-Time Patient Calling, Queue & Chamber Telemetry ({queueSummary.filter(t => t.status === 'WAITING').length} Waiting)
            </p>
          </div>
        </div>

        {/* Status Indicators & Clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          {/* WebSocket Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: isConnected ? '#064e3b' : '#7f1d1d', border: `1px solid ${isConnected ? '#059669' : '#dc2626'}`, padding: '6px 14px', borderRadius: '20px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: isConnected ? '#34d399' : '#f87171', boxShadow: isConnected ? '0 0 10px #34d399' : 'none', animation: 'liveBlink 1.5s infinite ease-in-out' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: isConnected ? '#a7f3d0' : '#fecaca' }}>
              {isConnected ? 'EVENT BUS LIVE' : 'CONNECTING BUS...'}
            </span>
          </div>

          {/* Sound Toggle */}
          <button 
            type="button" 
            onClick={() => setAudioEnabled(!audioEnabled)} 
            style={{ background: audioEnabled ? '#1e293b' : '#334155', border: '1px solid #475569', color: '#f8fafc', padding: '6px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}
          >
            {audioEnabled ? <Volume2 size={16} style={{ color: '#22c55e' }} /> : <VolumeX size={16} style={{ color: '#94a3b8' }} />}
            <span>{audioEnabled ? 'Chime ON' : 'Muted'}</span>
          </button>

          {/* Digital Clock */}
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '6px 16px', textAlign: 'right' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, fontFamily: 'monospace', color: '#38bdf8' }}>
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              {currentTime.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Announcement Section: BIG CALLING BANNER */}
      {activeCall ? (
        <div 
          style={{ 
            background: callFlash ? 'linear-gradient(135deg, #7f1d1d 0%, #1e1b4b 100%)' : '#1e1b4b',
            border: `3px solid ${callFlash ? '#ef4444' : '#6366f1'}`,
            borderRadius: '16px',
            padding: '32px 40px',
            marginBottom: '32px',
            boxShadow: callFlash ? '0 0 40px rgba(239, 68, 68, 0.4)' : '0 10px 30px rgba(0,0,0,0.4)',
            transition: 'all 0.4s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ background: '#dc2626', color: '#ffffff', fontSize: '0.85rem', fontWeight: 900, padding: '4px 12px', borderRadius: '20px', letterSpacing: '1px', textTransform: 'uppercase', animation: 'liveBlink 1.2s infinite' }}>
                  📢 NOW CALLING
                </span>
                <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>Called at {activeCall.called_at}</span>
              </div>
              
              <div style={{ fontSize: '3.6rem', fontWeight: 900, fontFamily: 'monospace', color: '#fbbf24', letterSpacing: '2px', lineHeight: 1.1 }}>
                {activeCall.token_number}
              </div>

              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc', marginTop: '8px' }}>
                Patient: <strong style={{ color: '#ffffff' }}>{activeCall.patient_name}</strong>
              </div>
            </div>

            {/* Target Chamber Callout */}
            <div style={{ background: 'rgba(255, 255, 255, 0.08)', border: '2px solid rgba(255, 255, 255, 0.2)', borderRadius: '14px', padding: '24px 32px', textAlign: 'center', minWidth: '320px' }}>
              <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: '#cbd5e1', fontWeight: 800, letterSpacing: '1px', display: 'block' }}>
                PLEASE PROCEED TO
              </span>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#38bdf8', margin: '6px 0' }}>
                {activeCall.room_number}
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#e2e8f0' }}>
                {activeCall.doctor_name}
              </div>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                {activeCall.department}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '28px 32px', marginBottom: '32px', textAlign: 'center' }}>
          <Clock size={36} style={{ color: '#38bdf8', margin: '0 auto 10px' }} />
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
            Waiting Area Active • Watching for Incoming Calls
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '6px 0 0' }}>
            Tokens called by doctors in any chamber will instantly chime and appear here with their room destination.
          </p>
        </div>
      )}

      {/* 2b. Department who's next (WAITING tokens) */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} style={{ color: '#fbbf24' }} /> Who&apos;s next · department queue
          </h3>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700 }}
          >
            <option value="ALL">All Departments</option>
            {Array.from(new Set([
              ...rosterDoctors.map((d) => d.department),
              ...queueSummary.map((t) => t.department),
            ].filter(Boolean))).sort().map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
        {(() => {
          const waiting = queueSummary
            .filter((t) => String(t.status || '').toUpperCase() === 'WAITING')
            .filter((t) => deptFilter === 'ALL' || t.department === deptFilter)
            .sort((a, b) => (a.priority_rank ?? 99) - (b.priority_rank ?? 99));
          if (waiting.length === 0) {
            return (
              <p style={{ color: '#64748b', fontSize: '0.88rem', fontStyle: 'italic', margin: 0 }}>
                No waiting tokens{deptFilter !== 'ALL' ? ` in ${deptFilter}` : ''} right now.
              </p>
            );
          }
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {waiting.slice(0, 12).map((t, idx) => (
                <div key={t.token_id || `${t.token_number}-${idx}`} style={{ background: '#0f172a', border: idx === 0 ? '1px solid #fbbf24' : '1px solid #334155', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 900, color: idx === 0 ? '#fbbf24' : '#38bdf8', textTransform: 'uppercase' }}>
                    {idx === 0 ? 'Next up' : `#${idx + 1}`}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, fontFamily: 'monospace', color: '#f8fafc', marginTop: 4 }}>
                    {t.token_number}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
                    {t.department || 'OPD'}{t.priority ? ` · ${t.priority}` : ''}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* 3. Split Grid: Chamber Status Boards & Recent Calls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px' }}>
        
        {/* RECENTLY CALLED TOKENS */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: '#38bdf8' }} /> Recently Called to Chambers
            </h3>
            <span style={{ fontSize: '0.75rem', background: '#334155', color: '#cbd5e1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
              LIVE FEED
            </span>
          </div>

          {callHistory.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.88rem', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
              No recent tokens called yet. Call a patient from Doctor Desk to see live action!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {callHistory.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '12px 16px' }}>
                  <div>
                    <strong style={{ fontSize: '1.15rem', color: '#fbbf24', fontFamily: 'monospace' }}>
                      {item.token_number}
                    </strong>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                      {item.doctor_name} • {item.department}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8' }}>
                      {item.room_number}
                    </span>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {item.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ACTIVE CHAMBER STATUS OVERVIEW (REAL VICTORIA HOSPITAL ROSTER) */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Stethoscope size={18} style={{ color: '#10b981' }} /> Active OPD Chambers ({OPERATIONAL_HOSPITAL_ID})
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700 }}
              >
                <option value="ALL">All Departments ({rosterDoctors.length})</option>
                {Array.from(new Set(rosterDoctors.map((d) => d.department))).sort().map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <span style={{ fontSize: '0.75rem', background: '#064e3b', color: '#6ee7b7', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                {rosterDoctors.filter((d) => d.status === 'AVAILABLE').length} / {rosterDoctors.length} AVAILABLE
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
            {(deptFilter === 'ALL' ? rosterDoctors : rosterDoctors.filter((d) => d.department === deptFilter)).map((doc) => {
              const st = (doc.status || 'AVAILABLE').toUpperCase();
              const isAvail = st === 'AVAILABLE';
              const isBusy = st === 'BUSY';
              const badgeColor = isAvail ? '#34d399' : (isBusy ? '#fbbf24' : '#94a3b8');
              const badgeBg = isAvail ? 'rgba(52, 211, 153, 0.12)' : (isBusy ? 'rgba(251, 191, 36, 0.15)' : 'rgba(148, 163, 184, 0.12)');
              const label = isAvail ? 'Available' : (isBusy ? 'In Consultation' : st);
              return (
                <div key={doc.doctor_id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '6px' }}>
                    <strong style={{ color: '#38bdf8', fontSize: '0.84rem' }}>{doc.room_number}</strong>
                    <span style={{ fontSize: '0.66rem', color: badgeColor, background: badgeBg, padding: '1px 6px', borderRadius: '4px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff' }}>{doc.name}</div>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span>{doc.department}</span>
                    {doc.active_queue_count > 0 && (
                      <span style={{ color: '#fbbf24', fontWeight: 700 }}>Queue: {doc.active_queue_count}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}
