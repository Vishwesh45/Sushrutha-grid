import React, { useEffect, useMemo, useState } from 'react';
import { Send, ClipboardList, Building2, Stethoscope, Bed, Lock } from 'lucide-react';
import api from '../services/api';

const VICTORIA_ID = 'HOSP-BLR-001';
const VICTORIA_NAME = 'Victoria Hospital (BMCRI Apex Medical Center)';

const StarRow = ({ value, onChange }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {[1, 2, 3, 4, 5].map((n) => {
      const on = value >= n;
      const band = n <= 2 ? 'bad' : n === 3 ? 'average' : 'good';
      const palette = {
        bad: { bg: '#fef2f2', border: '#fca5a5', color: '#b91c1c' },
        average: { bg: '#fffbeb', border: '#fcd34d', color: '#b45309' },
        good: { bg: '#ecfdf5', border: '#6ee7b7', color: '#047857' },
      }[band];
      const c = on ? palette : { bg: '#fff', border: '#e2e8f0', color: '#94a3b8' };
      return (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={{
            minWidth: 42,
            padding: '7px 8px',
            borderRadius: 8,
            border: `1.5px solid ${c.border}`,
            background: c.bg,
            color: c.color,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {n}★
        </button>
      );
    })}
  </div>
);

const Section = ({ icon: Icon, title, hint, children }) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 12, background: '#fff' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <Icon size={16} color="#0f766e" />
      <strong style={{ color: '#0f172a' }}>{title}</strong>
    </div>
    {hint && <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>{hint}</p>}
    {children}
  </div>
);

const LockedField = ({ label, value }) => (
  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
    {label}
    <div
      style={{
        marginTop: 4,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        color: '#0f172a',
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Lock size={13} color="#64748b" />
      {value || '—'}
    </div>
  </div>
);

const visitId = (v) => v?.id || v?.consultation_id || null;

const isReviewableVisit = (v) => {
  const st = String(v?.status || '').toLowerCase();
  return st === 'completed' || Boolean(v?.prescription_id) || Boolean(v?.completed_at);
};

export default function PatientReviewPage({
  isAuthenticated,
  onNeedAuth,
  visits = [],
  myReviews = [],
  onReviewsChanged,
  preferredVisitId = null,
}) {
  const reviewable = useMemo(
    () => (visits || []).filter(isReviewableVisit),
    [visits]
  );

  const reviewedByConsult = useMemo(() => {
    const map = {};
    (myReviews || []).forEach((r) => {
      if (r.consultation_id) map[r.consultation_id] = r;
    });
    return map;
  }, [myReviews]);

  const openVisits = useMemo(
    () => reviewable.filter((v) => !reviewedByConsult[visitId(v)]),
    [reviewable, reviewedByConsult]
  );

  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({
    facility_rating: 4,
    department_rating: 4,
    doctor_rating: 4,
    ward_rating: 4,
    cleanliness_rating: 4,
    waiting_time_rating: 4,
    staff_behaviour_rating: 4,
    facility_comment: '',
    department_comment: '',
    doctor_comment: '',
    ward_comment: '',
    overall_comment: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!openVisits.length) {
      setSelectedId(null);
      return;
    }
    const preferred = preferredVisitId && openVisits.find((v) => visitId(v) === preferredVisitId);
    const stillValid = openVisits.some((v) => visitId(v) === selectedId);
    if (!stillValid) {
      setSelectedId(visitId(preferred || openVisits[0]));
    }
  }, [openVisits, preferredVisitId, selectedId]);

  const selected = openVisits.find((v) => visitId(v) === selectedId) || null;

  const locked = useMemo(() => {
    if (!selected) return null;
    return {
      consultation_id: visitId(selected),
      hospital_id: selected.hospital_id || VICTORIA_ID,
      hospital_name: selected.hospital_name || VICTORIA_NAME,
      department: selected.department || 'General Medicine',
      doctor_name: selected.assigned_doctor_name || selected.doctor_name || 'Assigned doctor',
      doctor_id: selected.assigned_doctor_id || selected.doctor_id || undefined,
      token_number: selected.token_number || '',
      ward_name: selected.assigned_room
        ? `Chamber ${selected.assigned_room}`
        : 'OPD Chamber / Waiting Area',
    };
  }, [selected]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      onNeedAuth?.();
      return;
    }
    if (!locked?.consultation_id) {
      setError('Select a completed visit that still needs a review.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post('/reviews', {
        hospital_id: locked.hospital_id,
        consultation_id: locked.consultation_id,
        department: locked.department,
        doctor_name: locked.doctor_name,
        doctor_id: locked.doctor_id,
        ward_name: locked.ward_name,
        token_number: locked.token_number || undefined,
        facility_rating: form.facility_rating,
        department_rating: form.department_rating,
        doctor_rating: form.doctor_rating,
        ward_rating: form.ward_rating,
        cleanliness_rating: form.cleanliness_rating,
        waiting_time_rating: form.waiting_time_rating,
        staff_behaviour_rating: form.staff_behaviour_rating,
        facility_comment: form.facility_comment || undefined,
        department_comment: form.department_comment || undefined,
        doctor_comment: form.doctor_comment || undefined,
        ward_comment: form.ward_comment || undefined,
        overall_comment: form.overall_comment || undefined,
      });
      setDone(res.data);
      await onReviewsChanged?.();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="patient-panel">
        <h2>Reviews</h2>
        <p className="panel-lead">Sign in to rate your completed visit — hospital, department, and the doctor you saw.</p>
        <button type="button" className="btn btn-primary" onClick={onNeedAuth}>Sign in to review</button>
      </div>
    );
  }

  return (
    <div className="patient-panel">
      <h2>Reviews & ratings</h2>
      <p className="panel-lead">
        One review per completed appointment. Hospital, department, and doctor are locked to that visit — you cannot change them.
      </p>

      {done && (
        <div style={{
          marginBottom: 14, padding: 12, borderRadius: 10,
          background: done.has_emergency_flag ? '#fef2f2' : '#ecfdf5',
          border: `1px solid ${done.has_emergency_flag ? '#fecaca' : '#a7f3d0'}`,
          color: done.has_emergency_flag ? '#991b1b' : '#065f46',
          fontSize: '0.88rem',
        }}>
          Review saved for this appointment
          {done.token_number ? ` (token ${done.token_number})` : ''}.
          It also appears under <strong>My records</strong> for that visit.
        </div>
      )}

      {openVisits.length === 0 ? (
        <div style={{ padding: 14, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.88rem', color: '#475569' }}>
          {reviewable.length === 0
            ? 'No completed visits yet. Finish a consultation first, then you can leave one review for that appointment.'
            : 'You have already reviewed every completed visit. Open My records to see your ratings under each appointment.'}
        </div>
      ) : (
        <form onSubmit={submit}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
            Appointment to review
          </label>
          <select
            className="filter-select"
            style={{ width: '100%', marginBottom: 12 }}
            value={selectedId || ''}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setDone(null);
              setError(null);
            }}
            required
          >
            {openVisits.map((v) => (
              <option key={visitId(v)} value={visitId(v)}>
                {(v.department || 'OPD')}
                {v.token_number ? ` · Token ${v.token_number}` : ''}
                {v.assigned_doctor_name ? ` · ${v.assigned_doctor_name}` : ''}
              </option>
            ))}
          </select>

          {locked && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginBottom: 14,
              padding: 12,
              borderRadius: 12,
              border: '1px solid #bbf7d0',
              background: '#f0fdf4',
            }}>
              <LockedField label="Hospital" value={locked.hospital_name} />
              <LockedField label="Department" value={locked.department} />
              <LockedField label="Doctor" value={locked.doctor_name} />
              <LockedField label="Token / chamber" value={`${locked.token_number || '—'} · ${locked.ward_name}`} />
            </div>
          )}

          <Section icon={Building2} title="Overall hospital" hint="Facility experience for this visit.">
            <StarRow value={form.facility_rating} onChange={(n) => setField('facility_rating', n)} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginTop: 10 }}>
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Cleanliness</div>
                <StarRow value={form.cleanliness_rating} onChange={(n) => setField('cleanliness_rating', n)} />
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Waiting time</div>
                <StarRow value={form.waiting_time_rating} onChange={(n) => setField('waiting_time_rating', n)} />
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Staff behaviour</div>
                <StarRow value={form.staff_behaviour_rating} onChange={(n) => setField('staff_behaviour_rating', n)} />
              </div>
            </div>
            <textarea rows={2} placeholder="Hospital comment (optional)" value={form.facility_comment} onChange={(e) => setField('facility_comment', e.target.value)} style={{ width: '100%', marginTop: 10, borderRadius: 8, border: '1px solid #e2e8f0', padding: 8, fontSize: '0.84rem' }} />
          </Section>

          <Section icon={ClipboardList} title={`Department — ${locked?.department || 'OPD'}`} hint="Locked to the specialty of this appointment.">
            <StarRow value={form.department_rating} onChange={(n) => setField('department_rating', n)} />
            <textarea rows={2} placeholder="Department comment (optional)" value={form.department_comment} onChange={(e) => setField('department_comment', e.target.value)} style={{ width: '100%', marginTop: 10, borderRadius: 8, border: '1px solid #e2e8f0', padding: 8, fontSize: '0.84rem' }} />
          </Section>

          <Section icon={Stethoscope} title={`Doctor — ${locked?.doctor_name || 'Assigned doctor'}`} hint="Locked to the doctor who saw you on this visit.">
            <StarRow value={form.doctor_rating} onChange={(n) => setField('doctor_rating', n)} />
            <textarea rows={2} placeholder="Doctor comment (optional)" value={form.doctor_comment} onChange={(e) => setField('doctor_comment', e.target.value)} style={{ width: '100%', marginTop: 10, borderRadius: 8, border: '1px solid #e2e8f0', padding: 8, fontSize: '0.84rem' }} />
          </Section>

          <Section icon={Bed} title="Ward / waiting / chamber" hint="OPD waiting hall and chamber for this visit.">
            <StarRow value={form.ward_rating} onChange={(n) => setField('ward_rating', n)} />
            <textarea rows={2} placeholder="Ward comment (optional)" value={form.ward_comment} onChange={(e) => setField('ward_comment', e.target.value)} style={{ width: '100%', marginTop: 10, borderRadius: 8, border: '1px solid #e2e8f0', padding: 8, fontSize: '0.84rem' }} />
          </Section>

          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>Overall note</label>
          <textarea rows={3} placeholder="Anything else for hospital administration" value={form.overall_comment} onChange={(e) => setField('overall_comment', e.target.value)} style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', padding: 8, fontSize: '0.84rem', marginBottom: 12 }} />

          {error && <p style={{ color: '#b91c1c', fontSize: '0.84rem' }}>{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting || !locked}>
            <Send size={14} /> {submitting ? 'Submitting…' : 'Submit review for this appointment'}
          </button>
        </form>
      )}
    </div>
  );
}
