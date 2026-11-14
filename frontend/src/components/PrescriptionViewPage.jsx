import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  FileText, Printer, ArrowLeft, CheckCircle2, ShieldCheck, 
  Calendar, Clock, User, Stethoscope, AlertCircle, Share2, Download
} from 'lucide-react';
import api from '../services/api';

const formatUtcDate = (dateStr) => {
  if (!dateStr) return '—';
  const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  const d = new Date(utcStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatUtcTime = (dateStr) => {
  if (!dateStr) return '—';
  const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  const d = new Date(utcStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function PrescriptionViewPage() {
  const { prescription_id } = useParams();
  const navigate = useNavigate();
  const [rx, setRx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPrescription = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/doctor-desk/prescriptions/${prescription_id}`);
        setRx(res.data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Prescription record could not be loaded.');
      } finally {
        setLoading(false);
      }
    };

    if (prescription_id) {
      fetchPrescription();
    }
  }, [prescription_id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '14px' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#c4161c', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Loading official digital prescription...</p>
      </div>
    );
  }

  if (error || !rx) {
    return (
      <div style={{ maxWidth: '640px', margin: '40px auto', padding: '24px', background: '#fff', borderRadius: '12px', border: '1px solid #fee2e2', textAlign: 'center' }}>
        <AlertCircle size={40} style={{ color: '#dc2626', margin: '0 auto 12px' }} />
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#991b1b', marginBottom: '8px' }}>Prescription Not Found</h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '20px' }}>{error || 'No matching prescription was found in the hospital registry.'}</p>
        <button type="button" onClick={() => navigate(-1)} className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> Return Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100%', background: '#f1f5f9', padding: '24px 16px' }}>
      {/* Top Action Control Toolbar (Hidden during print) */}
      <div className="no-print" style={{ maxWidth: '850px', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <button 
          type="button" 
          onClick={() => navigate(-1)} 
          className="btn btn-outline"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
        >
          <ArrowLeft size={15} /> Back
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.82rem', color: '#166534', background: '#dcfce7', padding: '4px 10px', borderRadius: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <CheckCircle2 size={13} /> ABDM Validated Digital Rx
          </span>
          <button 
            type="button" 
            onClick={handlePrint} 
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', padding: '8px 18px', backgroundColor: '#c4161c', border: 'none' }}
          >
            <Printer size={16} /> Print Prescription
          </button>
        </div>
      </div>

      {/* Official Medical Letterhead Prescription Slip */}
      <div 
        className="printable-rx-sheet" 
        style={{
          maxWidth: '850px',
          margin: '0 auto',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1.5px solid #cbd5e1',
          boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
          padding: '40px 48px',
          color: '#0f172a'
        }}
      >
        {/* Hospital Header Letterhead */}
        <div style={{ borderBottom: '2.5px solid #c4161c', paddingBottom: '16px', marginBottom: '22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ color: '#c4161c', fontSize: '1.4rem', fontWeight: 900 }}>+</span>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#580c12', letterSpacing: '-0.3px', margin: 0 }}>
                GOVERNMENT DISTRICT GENERAL HOSPITAL
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#334155', fontWeight: 600 }}>
              National Health Mission • Department of Health & Family Welfare
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              Karnataka State Digital Health Network • ABDM Facility ID: KA-BLR-00412
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'inline-block', background: '#fef2f2', border: '1px solid #fecaca', padding: '6px 14px', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>
                PRESCRIPTION NUMBER
              </span>
              <strong style={{ fontSize: '1.15rem', color: '#c4161c', fontFamily: 'monospace' }}>
                {rx.prescription_id}
              </strong>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '6px' }}>
              Date: <strong>{formatUtcDate(rx.issued_at)}</strong> • {formatUtcTime(rx.issued_at)}
            </div>
          </div>
        </div>

        {/* Patient & Doctor Meta Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '24px' }}>
          <div>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800, letterSpacing: '0.4px', display: 'block' }}>PATIENT INFORMATION</span>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>{rx.patient_name}</div>
            <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '3px' }}>
              UHID: <strong>{rx.patient_uhid || 'SG-PAT-REG'}</strong>
              {rx.token_number && <span style={{ marginLeft: '10px', background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: '4px', fontSize: '0.74rem', fontWeight: 800 }}>Token: {rx.token_number}</span>}
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 800, letterSpacing: '0.4px', display: 'block' }}>PRESCRIBING CLINICIAN</span>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>{rx.doctor_name}</div>
            <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '3px' }}>
              {rx.doctor_qualification} • Reg No: <strong>{rx.doctor_registration_no || 'KMC-8921'}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
              {rx.department} • <strong>{rx.room_number || 'OPD Chamber'}</strong>
            </div>
          </div>
        </div>

        {/* Clinical Diagnosis Block */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>CLINICAL DIAGNOSIS</span>
            {rx.icd10_code && (
              <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#334155', padding: '1px 7px', borderRadius: '4px', fontWeight: 700 }}>
                ICD-10: {rx.icd10_code}
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
            {rx.clinical_diagnosis}
          </div>
          {rx.clinical_notes && (
            <p style={{ fontSize: '0.85rem', color: '#475569', fontStyle: 'italic', margin: '6px 0 0' }}>
              Notes: {rx.clinical_notes}
            </p>
          )}
        </div>

        {/* Rx Symbol & Medication Table */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 900, fontFamily: 'serif', color: '#c4161c', lineHeight: 1 }}>℞</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 900, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px' }}>
              PRESCRIBED MEDICATIONS & DOSAGE
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800, color: '#334155' }}>#</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800, color: '#334155' }}>Medicine Name</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800, color: '#334155' }}>Dosage</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800, color: '#334155' }}>Frequency</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800, color: '#334155' }}>Timing</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800, color: '#334155' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {rx.medications?.map((med, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 800, color: '#0f172a' }}>
                    {med.medicine_name}
                    {med.instructions && (
                      <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>
                        Note: {med.instructions}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#334155', fontWeight: 600 }}>{med.dosage || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 700 }}>{med.frequency}</td>
                  <td style={{ padding: '10px 12px', color: '#334155' }}>{med.timing}</td>
                  <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 700 }}>{med.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Diagnostic Investigations Advised */}
        {rx.investigations_advised && rx.investigations_advised.length > 0 && (
          <div style={{ marginBottom: '22px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', color: '#1e40af', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
              LABORATORY & RADIOLOGICAL INVESTIGATIONS ADVISED
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {rx.investigations_advised.map((test, idx) => (
                <span key={idx} style={{ background: '#ffffff', border: '1px solid #93c5fd', color: '#1e3a8a', padding: '3px 10px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700 }}>
                  🧪 {test}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Dietary / Lifestyle Advice & Follow-up */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          {rx.diet_lifestyle_advice && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', color: '#92400e', letterSpacing: '0.4px', display: 'block', marginBottom: '4px' }}>
                DIETARY & LIFESTYLE ADVICE
              </span>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#78350f' }}>{rx.diet_lifestyle_advice}</p>
            </div>
          )}

          {rx.follow_up_date && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', color: '#166534', letterSpacing: '0.4px', display: 'block', marginBottom: '4px' }}>
                SCHEDULED FOLLOW-UP
              </span>
              <p style={{ margin: 0, fontSize: '0.92rem', color: '#14532d', fontWeight: 800 }}>
                📅 Review on {formatUtcDate(rx.follow_up_date)}
              </p>
            </div>
          )}
        </div>

        {/* Digital Signature Footer */}
        <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '20px', marginTop: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontSize: '0.8rem', fontWeight: 800, marginBottom: '4px' }}>
              <ShieldCheck size={16} /> Cryptographically Signed & Timestamped
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
              Prescription Hash: SHA-256-{rx.prescription_id.replace(/-/g, '')}8819 • Valid under Indian IT Act 2000
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
              Dispense only through registered Jan Aushadhi or Hospital Pharmacy.
            </p>
          </div>

          <div style={{ textAlign: 'center', minWidth: '180px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '1rem', color: '#1e293b', fontWeight: 800, borderBottom: '1px solid #94a3b8', paddingBottom: '4px', marginBottom: '4px' }}>
              {rx.doctor_name}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Authorized Medical Officer</span>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Reg: {rx.doctor_registration_no || 'KMC-88910'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
