import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Stethoscope, User, Calendar, Clock, AlertTriangle, CheckCircle2,
  ShieldCheck, FileText, Pill, Plus, Trash2, Printer, X, RefreshCw,
  Sparkles, Activity, LogOut, KeyRound, Search, Phone, ChevronRight,
  ClipboardList, FlaskConical, AlertCircle, Check, Volume2, FastForward, Play
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useHospitalWebSocket } from '../services/useHospitalWebSocket';
import UnifiedAuthModal from './UnifiedAuthModal';
import { downloadPrescriptionFile, openPrescriptionInNewTab, downloadPrescriptionPdf } from '../utils/prescriptionDownload';

const DEFAULT_MEDICATION_ROW = {
  medicine_name: '',
  dosage: '500 mg',
  frequency: '1-0-1',
  timing: 'After Food',
  duration: '5 Days',
  instructions: ''
};

const defaultFollowUpOn = (daysAhead = 5) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
};

const COMMON_QUICK_MEDS = [
  { name: 'Paracetamol 650mg', dosage: '650 mg', freq: '1-0-1', timing: 'After Food', duration: '5 Days' },
  { name: 'Amoxicillin 500mg', dosage: '500 mg', freq: '1-0-1', timing: 'After Food', duration: '5 Days' },
  { name: 'Azithromycin 500mg', dosage: '500 mg', freq: '1-0-0', timing: 'Before Food', duration: '3 Days' },
  { name: 'Pantoprazole 40mg', dosage: '40 mg', freq: '1-0-0', timing: 'Before Food', duration: '7 Days' },
  { name: 'Cetirizine 10mg', dosage: '10 mg', freq: '0-0-1', timing: 'At Bedtime', duration: '5 Days' },
  { name: 'ORS Electrolyte Sachet', dosage: '1 Sachet in 1L Water', freq: 'SOS', timing: 'Throughout Day', duration: '3 Days' },
  { name: 'Ibuprofen 400mg', dosage: '400 mg', freq: '1-0-1', timing: 'After Food', duration: '3 Days' }
];

const COMMON_INVESTIGATIONS = [
  'Complete Blood Count (CBC)',
  'Dengue NS1 Antigen & IgM/IgG',
  'Widal Test (Typhoid)',
  'Chest X-Ray (PA View)',
  'Serum Electrolytes',
  'Urine Routine & Microscopy',
  'Random Blood Sugar (RBS)',
  'ECG 12-Lead',
  'Pelvic Ultrasound (USG Pelvis)',
  'Serum LH : FSH Ratio',
  'Total & Free Testosterone',
  'Fasting Blood Glucose & Insulin (HOMA-IR)',
  'Anti-Müllerian Hormone (AMH)'
];

const formatUtcTime = (dateStr) => {
  if (!dateStr) return '—';
  const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  const d = new Date(utcStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatUtcDate = (dateStr) => {
  if (!dateStr) return '—';
  const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  const d = new Date(utcStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};

const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  const d = new Date(utcStr);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfLocalDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfLocalDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const tokenCompletedAt = (t) => parseLocalDate(t.completed_at || t.updated_at || t.created_at);

export default function DoctorDesk() {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Doctor Dashboard state
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [metrics, setMetrics] = useState({ waiting: 0, in_consultation: 0, completed_today: 0 });
  const [queueTokens, setQueueTokens] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Active consultation & prescription state
  const [activeToken, setActiveToken] = useState(null);
  const [patientHistory, setPatientHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Prescription Form
  const [rxForm, setRxForm] = useState({
    clinical_diagnosis: '',
    icd10_code: '',
    clinical_notes: '',
    medications: [{ ...DEFAULT_MEDICATION_ROW }],
    investigations_advised: [],
    diet_lifestyle_advice: 'Drink plenty of boiled and cooled water. Take adequate rest.',
    follow_up_date: 'Review after 5 days if symptoms persist',
    follow_up_on: defaultFollowUpOn(5),
  });
  const [submittingRx, setSubmittingRx] = useState(false);

  // View / Print modal
  const [issuedRxModal, setIssuedRxModal] = useState(null);
  const [alertMsg, setAlertMsg] = useState(null);
  const [alertType, setAlertType] = useState('success');
  // Tabbed desk: queue | consultation | prescription | completed
  const [deskTab, setDeskTab] = useState('queue');
  const [completedFilter, setCompletedFilter] = useState('today'); // today | yesterday | range
  const [completedFrom, setCompletedFrom] = useState('');
  const [completedTo, setCompletedTo] = useState('');

  useEffect(() => {
    if (location.state?.resetWorkspace) {
      setDeskTab('queue');
      setActiveToken(null);
    }
  }, [location.state?.resetWorkspace]);

  const showAlert = (msg, type = 'success') => {
    setAlertMsg(msg);
    setAlertType(type);
    setTimeout(() => setAlertMsg(null), 5000);
  };

  // Fetch doctor profile and queue if logged in as doctor
  const isDoctorRole = user && (user.role === 'doctor' || user.role === 'admin');

  const fetchDoctorProfileAndQueue = async () => {
    if (!isDoctorRole) return;
    setLoadingQueue(true);
    try {
      const [profileRes, queueRes] = await Promise.all([
        api.get('/doctor-desk/me'),
        api.get('/doctor-desk/queue')
      ]);

      if (profileRes.data?.doctor) {
        setDoctorProfile(profileRes.data.doctor);
        setMetrics(profileRes.data.metrics || { waiting: 0, in_consultation: 0, completed_today: 0 });
      }

      if (queueRes.data?.tokens) {
        setQueueTokens(queueRes.data.tokens);
        // If there's an in-consultation token, auto-select it if none selected
        const currentInConsult = queueRes.data.tokens.find((t) => t.status === 'IN_CONSULTATION');
        if (currentInConsult && !activeToken) {
          selectPatientForConsultation(currentInConsult);
        }
      }
    } catch (err) {
      console.error('Error fetching doctor desk data:', err);
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    if (isDoctorRole) {
      fetchDoctorProfileAndQueue();
    }
  }, [isDoctorRole]);

  // Real-Time WebSocket event listener: auto-refresh chamber queue on new patient tokens or status updates
  useHospitalWebSocket((payload) => {
    if (payload.data?.hospital_id && payload.data.hospital_id !== 'HOSP-BLR-001') {
      return;
    }
    if (
      payload.event === 'TOKEN_ISSUED' || 
      payload.event === 'TOKEN_CALLED' || 
      payload.event === 'CONSULTATION_STARTED' || 
      payload.event === 'CONSULTATION_COMPLETED' ||
      payload.event === 'PATIENT_SKIPPED' ||
      payload.event === 'TOKEN_REJOINED' ||
      payload.event === 'PRESCRIPTION_ISSUED' ||
      payload.event === 'DOCTOR_STATUS_UPDATED'
    ) {
      if (isDoctorRole) {
        fetchDoctorProfileAndQueue();
      }
    }
  });

  // Select patient into active examination workspace
  const selectPatientForConsultation = async (token, nextTab = 'consultation') => {
    const completed = String(token.status || '').toUpperCase() === 'COMPLETED';
    setActiveToken(token);
    setDeskTab(nextTab);

    if (!completed) {
      // Pre-fill diagnosis if AI extracted a differential condition
      let defaultDiag = '';
      let defaultIcd = '';
      if (token.extracted_entities?.correlated_conditions?.length > 0) {
        const topCond = token.extracted_entities.correlated_conditions[0];
        defaultDiag = topCond.condition || '';
        defaultIcd = topCond.icd10 || '';
      }

      setRxForm({
        clinical_diagnosis: defaultDiag,
        icd10_code: defaultIcd,
        clinical_notes: `Patient reports: "${token.chief_complaint || ''}".\nExamination: Conscious, oriented. Vitals stable.`,
        medications: [{ ...DEFAULT_MEDICATION_ROW }],
        investigations_advised: [],
        diet_lifestyle_advice: 'Drink plenty of boiled and cooled fluids. Light diet, avoid spicy/oily food.',
        follow_up_date: 'Review after 5 days if symptoms persist',
        follow_up_on: defaultFollowUpOn(5),
      });
    }

    // Fetch patient clinical history if patient_id is present
    if (token.patient_id) {
      setLoadingHistory(true);
      try {
        const histRes = await api.get(`/doctor-desk/patient-history/${token.patient_id}`);
        setPatientHistory(histRes.data);
      } catch (err) {
        console.warn('Could not load patient history:', err);
      } finally {
        setLoadingHistory(false);
      }
    } else {
      setPatientHistory(null);
    }
  };

  const openCompletedRecord = async (token) => {
    await selectPatientForConsultation({ ...token, status: 'COMPLETED' }, 'consultation');
  };

  const openCompletedPrescription = async (token) => {
    try {
      if (token.prescription_id) {
        const res = await api.get(`/doctor-desk/prescriptions/${token.prescription_id}`);
        setIssuedRxModal(res.data);
        return;
      }
      if (token.consultation_id) {
        const res = await api.get(`/doctor-desk/prescriptions/by-consultation/${token.consultation_id}`);
        if (res.data?.prescription) {
          setIssuedRxModal(res.data.prescription);
          return;
        }
      }
      showAlert('No prescription found for this completed visit.', 'error');
    } catch {
      showAlert('Could not load prescription.', 'error');
    }
  };

  // Call patient to chamber
  const handleCallPatient = async (token) => {
    if (String(token.status || '').toUpperCase() === 'COMPLETED') {
      showAlert('Completed visits cannot be called again.', 'error');
      return;
    }
    const st = String(token.status || '').toUpperCase();
    // Sequential call: only next WAITING (or recall already CALLED)
    if (st === 'WAITING' && token.is_next_callable === false) {
      showAlert('Call next in line only — you cannot skip patients later in the queue.', 'error');
      return;
    }
    setActionLoadingId(token.token_id);
    try {
      await api.post(`/doctor-desk/call/${token.token_id}`);
      showAlert(`Token ${token.token_number} called to your chamber!`);
      await selectPatientForConsultation({ ...token, status: 'CALLED' }, 'consultation');
      await fetchDoctorProfileAndQueue();
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Failed to call token.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Start consultation
  const handleStartConsultation = async (token) => {
    if (String(token.status || '').toUpperCase() === 'COMPLETED') {
      showAlert('Completed visits are read-only.', 'error');
      return;
    }
    setActionLoadingId(token.token_id);
    try {
      await api.post(`/doctor-desk/start/${token.token_id}`);
      showAlert(`Consultation initiated for Token ${token.token_number}.`);
      await selectPatientForConsultation({ ...token, status: 'IN_CONSULTATION' }, 'consultation');
      await fetchDoctorProfileAndQueue();
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Failed to start consultation.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Skip / No-show patient with grace period
  const handleSkipPatient = async (token) => {
    if (!token) return;
    if (String(token.status || '').toUpperCase() === 'COMPLETED') {
      showAlert('Completed visits cannot be skipped.', 'error');
      return;
    }
    setActionLoadingId(token.token_id);
    try {
      await api.post(`/doctor-desk/skip/${token.token_id}`);
      showAlert(`Token ${token.token_number} marked as SKIPPED (15-min grace window active).`);
      if (activeToken?.token_id === token.token_id) {
        setActiveToken((prev) => (prev ? { ...prev, status: 'SKIPPED' } : null));
      }
      await fetchDoctorProfileAndQueue();
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Failed to skip token.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Prescription: Add medication row
  const handleAddMedicationRow = () => {
    setRxForm((prev) => ({
      ...prev,
      medications: [...prev.medications, { ...DEFAULT_MEDICATION_ROW }]
    }));
  };

  // Prescription: Remove medication row
  const handleRemoveMedicationRow = (index) => {
    setRxForm((prev) => {
      if (prev.medications.length <= 1) return prev;
      return {
        ...prev,
        medications: prev.medications.filter((_, i) => i !== index)
      };
    });
  };

  // Prescription: Update medication field
  const handleMedChange = (index, field, value) => {
    setRxForm((prev) => {
      const updated = [...prev.medications];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, medications: updated };
    });
  };

  // Prescription: Quick add predefined medicine
  const handleQuickAddMed = (med) => {
    setRxForm((prev) => {
      // If the first row is empty, fill it; otherwise append
      if (prev.medications.length === 1 && !prev.medications[0].medicine_name.trim()) {
        return {
          ...prev,
          medications: [{
            medicine_name: med.name,
            dosage: med.dosage,
            frequency: med.freq,
            timing: med.timing,
            duration: med.duration,
            instructions: ''
          }]
        };
      }
      return {
        ...prev,
        medications: [
          ...prev.medications,
          {
            medicine_name: med.name,
            dosage: med.dosage,
            frequency: med.freq,
            timing: med.timing,
            duration: med.duration,
            instructions: ''
          }
        ]
      };
    });
  };

  // Toggle investigation checkbox
  const handleToggleInvestigation = (testName) => {
    setRxForm((prev) => {
      const exists = prev.investigations_advised.includes(testName);
      return {
        ...prev,
        investigations_advised: exists
          ? prev.investigations_advised.filter((t) => t !== testName)
          : [...prev.investigations_advised, testName]
      };
    });
  };

  // Adopt standardized Rotterdam 2003 diagnostic workup for PCOD
  const handleAdoptRotterdamWorkup = () => {
    const pcodTests = [
      'Pelvic Ultrasound (USG Pelvis)',
      'Serum LH : FSH Ratio',
      'Total & Free Testosterone',
      'Fasting Blood Glucose & Insulin (HOMA-IR)',
      'Anti-Müllerian Hormone (AMH)'
    ];
    setRxForm((prev) => {
      const merged = Array.from(new Set([...prev.investigations_advised, ...pcodTests]));
      return {
        ...prev,
        clinical_diagnosis: prev.clinical_diagnosis || 'Polycystic Ovary Syndrome (PCOS / PCOD)',
        icd10_code: prev.icd10_code || 'E28.2',
        investigations_advised: merged,
        diet_lifestyle_advice: prev.diet_lifestyle_advice || 'Low glycemic index diet, daily 30-min physical exercise, endocrine monitoring.'
      };
    });
  };

  // Submit and issue digital prescription
  const handleIssuePrescription = async (e) => {
    e.preventDefault();
    if (!activeToken) return;
    if (String(activeToken.status || '').toUpperCase() === 'COMPLETED') {
      showAlert('Completed visits cannot be edited.', 'error');
      return;
    }

    if (!rxForm.clinical_diagnosis.trim()) {
      showAlert('Please enter a clinical diagnosis or provisional impression.', 'error');
      return;
    }

    const validMeds = rxForm.medications.filter((m) => m.medicine_name.trim());
    if (validMeds.length === 0) {
      showAlert('Please add at least one medication to the prescription.', 'error');
      return;
    }

    setSubmittingRx(true);
    try {
      const payload = {
        consultation_id: activeToken.consultation_id || activeToken.token_id,
        token_id: activeToken.token_id,
        patient_id: activeToken.patient_id || 'PAT-WALKIN',
        patient_name: activeToken.patient_name || 'Patient',
        patient_uhid: activeToken.patient_uhid,
        clinical_diagnosis: rxForm.clinical_diagnosis.trim(),
        icd10_code: rxForm.icd10_code.trim() || undefined,
        clinical_notes: rxForm.clinical_notes.trim() || undefined,
        medications: validMeds,
        investigations_advised: rxForm.investigations_advised,
        diet_lifestyle_advice: rxForm.diet_lifestyle_advice.trim() || undefined,
        follow_up_date: rxForm.follow_up_date.trim() || undefined,
        follow_up_on: rxForm.follow_up_on || undefined,
      };

      const res = await api.post('/doctor-desk/prescribe', payload);
      showAlert(`Prescription ${res.data.prescription_id} issued successfully! Token marked COMPLETED.`);
      
      // Open issued Rx view modal
      setIssuedRxModal(res.data);

      // Clear active consult — completed visits live under Completed tab only
      setActiveToken(null);
      setCompletedFilter('today');
      setDeskTab('completed');
      fetchDoctorProfileAndQueue();
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Failed to issue prescription.', 'error');
    } finally {
      setSubmittingRx(false);
    }
  };

  // ==========================================================
  // RENDER: DOCTOR LOGIN VIEW (IF NOT AUTHENTICATED)
  // ==========================================================
  if (!isAuthenticated || !isDoctorRole) {
    return (
      <div className="portal-gate doctor-gate">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, background: '#ecfdf5', color: '#059669', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid #a7f3d0' }}>
            <Stethoscope size={32} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 800, color: '#064e3b', margin: '0 0 6px 0' }}>
            Doctor Clinical Desk
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
            Sign in to your OPD chamber, live queue, and digital prescription desk.
          </p>
        </div>

        {isAuthenticated && !isDoctorRole ? (
          <div className="switch-account-panel" style={{ marginTop: 8 }}>
            <p className="status-alert alert-error" style={{ marginBottom: 14 }}>
              <AlertCircle size={16} />
              <span>Signed in as <strong>{user?.name} ({user?.role})</strong>. Sign out to open the doctor desk.</span>
            </p>
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => logout(true)}>
              <LogOut size={14} /> Sign out &amp; switch
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', textAlign: 'center', lineHeight: 1.5 }}>
              Shared hospital sign-in opens on the Doctor tab. Switch to Patient or Admin anytime.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: 12, fontWeight: 800, background: '#059669', borderColor: '#059669' }}
              onClick={() => setAuthModalOpen(true)}
            >
              <KeyRound size={16} /> Sign in to continue
            </button>
          </div>
        )}

        <UnifiedAuthModal
          isOpen={authModalOpen}
          initialRole="doctor"
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => {
            showAlert('Clinical chamber desk is active.');
            fetchDoctorProfileAndQueue();
          }}
        />
      </div>
    );
  }

  const ACTIVE_QUEUE_STATUSES = new Set(['WAITING', 'CALLED', 'IN_CONSULTATION', 'SKIPPED']);
  const waitingQueueTokens = queueTokens.filter((t) => ACTIVE_QUEUE_STATUSES.has(String(t.status || '').toUpperCase()));
  const nextCallableToken = waitingQueueTokens.find((t) => t.is_next_callable && String(t.status || '').toUpperCase() === 'WAITING')
    || waitingQueueTokens
      .filter((t) => String(t.status || '').toUpperCase() === 'WAITING')
      .sort((a, b) => {
        const pr = (x) => (('RED' === x.priority) ? 0 : ('AMBER' === x.priority ? 1 : 2));
        return pr(a) - pr(b) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
      })[0]
    || null;
  const canCallToken = (t) => {
    const st = String(t.status || '').toUpperCase();
    if (st === 'CALLED') return true; // recall
    if (st !== 'WAITING') return false;
    if (t.is_next_callable === true) return true;
    if (t.is_next_callable === false) return false;
    return nextCallableToken && t.token_id === nextCallableToken.token_id;
  };
  const allCompletedTokens = queueTokens
    .filter((t) => String(t.status || '').toUpperCase() === 'COMPLETED')
    .sort((a, b) => (tokenCompletedAt(b)?.getTime() || 0) - (tokenCompletedAt(a)?.getTime() || 0));

  const filteredCompletedTokens = allCompletedTokens.filter((t) => {
    const when = tokenCompletedAt(t);
    if (!when) return completedFilter === 'range' ? false : true;
    const today0 = startOfLocalDay(new Date());
    const today1 = endOfLocalDay(new Date());
    const y0 = startOfLocalDay(new Date(Date.now() - 86400000));
    const y1 = endOfLocalDay(new Date(Date.now() - 86400000));
    if (completedFilter === 'today') return when >= today0 && when <= today1;
    if (completedFilter === 'yesterday') return when >= y0 && when <= y1;
    if (completedFilter === 'range') {
      // Empty range inputs → treat as today (do not dump other doctors' history)
      if (!completedFrom && !completedTo) return when >= today0 && when <= today1;
      const from = completedFrom ? startOfLocalDay(new Date(`${completedFrom}T00:00:00`)) : null;
      const to = completedTo ? endOfLocalDay(new Date(`${completedTo}T23:59:59`)) : null;
      if (from && when < from) return false;
      if (to && when > to) return false;
      return true;
    }
    return true;
  });

  const isActiveCompleted = String(activeToken?.status || '').toUpperCase() === 'COMPLETED';

  // ==========================================================
  // RENDER: FULL DOCTOR CLINICAL DESK WORKSPACE
  // ==========================================================
  return (
    <div className="doctor-workspace workspace-shell portal-page">
      {/* 1. Doctor Top Header Bar */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '48px', height: '48px', background: '#ecfdf5', color: '#059669', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #a7f3d0' }}>
            <Stethoscope size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                {doctorProfile?.name || user?.name || 'Doctor On Duty'}
              </h2>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, padding: '3px 8px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                {doctorProfile?.tier || 'SENIOR CLINICIAN'}
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.84rem', margin: '3px 0 0 0' }}>
              {doctorProfile?.designation || 'Consultant Physician'} • {doctorProfile?.department || user?.department || 'General Medicine'} • <strong>{doctorProfile?.room_number || user?.room_number || 'OPD Desk 101'}</strong>
            </p>
          </div>
        </div>

        {/* Doctor Action Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Metrics summary */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Waiting</span>
              <strong style={{ fontSize: '1.05rem', color: '#0284c7' }}>{metrics.waiting}</strong>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '6px 12px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.68rem', color: '#991b1b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Consulting</span>
              <strong style={{ fontSize: '1.05rem', color: '#b91c1c' }}>{metrics.in_consultation}</strong>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 12px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.68rem', color: '#166534', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Done Today</span>
              <strong style={{ fontSize: '1.05rem', color: '#15803d' }}>{metrics.completed_today}</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchDoctorProfileAndQueue}
            disabled={loadingQueue}
            className="btn btn-outline"
            style={{ padding: '7px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loadingQueue ? 'spin' : ''} /> Refresh
          </button>

          <button
            type="button"
            onClick={logout}
            className="btn btn-outline"
            style={{ padding: '7px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444' }}
          >
            <LogOut size={14} /> Exit
          </button>
        </div>
      </div>

      {/* Global Alert Notification */}
      {alertMsg && (
        <div className={`status-alert ${alertType === 'error' ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: '16px' }}>
          {alertType === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{alertMsg}</span>
        </div>
      )}

      {/* 2. Desk tabs — Waiting / Consultation / Prescription / Completed */}
      <div style={{ display: 'flex', gap: 6, padding: 6, marginBottom: 16, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'queue', label: 'Waiting patients', icon: ClipboardList, hint: waitingQueueTokens.length },
          { id: 'consultation', label: 'Consultation', icon: FileText, hint: activeToken && !isActiveCompleted ? activeToken.token_number : null },
          { id: 'prescription', label: 'Digital prescription', icon: Pill, hint: activeToken?.status === 'IN_CONSULTATION' ? 'Rx' : null },
          { id: 'completed', label: 'Completed', icon: CheckCircle2, hint: allCompletedTokens.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const freeTabs = tab.id === 'queue' || tab.id === 'completed';
          const locked = !freeTabs && !activeToken;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={locked && tab.id === 'prescription'}
              onClick={() => {
                if (!freeTabs && !activeToken) {
                  showAlert('Select or call a patient from Waiting patients first.', 'error');
                  setDeskTab('queue');
                  return;
                }
                if (tab.id === 'prescription' && isActiveCompleted) {
                  showAlert('Completed visits are read-only. Open the Rx from Completed history.', 'error');
                  setDeskTab('completed');
                  return;
                }
                setDeskTab(tab.id);
              }}
              style={{
                flex: 1,
                minWidth: 140,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '11px 12px',
                border: 'none',
                borderRadius: 9,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.86rem',
                background: deskTab === tab.id ? '#fff' : 'transparent',
                color: deskTab === tab.id ? '#0f172a' : '#64748b',
                boxShadow: deskTab === tab.id ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
              }}
            >
              <Icon size={16} />
              {tab.label}
              {tab.hint != null && tab.hint !== '' && (
                <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#047857', padding: '2px 7px', borderRadius: 999, fontWeight: 800 }}>{tab.hint}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="w-full">
        
        {/* ==================================================== */}
        {/* TAB: LIVE CHAMBER PATIENT QUEUE                      */}
        {/* ==================================================== */}
        {deskTab === 'queue' && (
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Chamber Patient Queue
              </h3>
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                {doctorProfile?.department || 'Department'} · live queue · {waitingQueueTokens.length} active
              </span>
            </div>

            {nextCallableToken && (
              <button
                type="button"
                onClick={() => handleCallPatient(nextCallableToken)}
                disabled={actionLoadingId === nextCallableToken.token_id}
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)'
                }}
                title={`Call next in line: ${nextCallableToken.token_number} (${nextCallableToken.patient_name})`}
              >
                <Volume2 size={13} /> Call Next ({nextCallableToken.token_number})
              </button>
            )}
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '0.76rem', color: '#64748b' }}>
            Sequential calling: only the next waiting patient can be called (priority order). Later queue tokens stay locked.
          </p>

          {loadingQueue && waitingQueueTokens.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: '#059669' }} />
              <p style={{ fontSize: '0.84rem' }}>Loading chamber tokens...</p>
            </div>
          ) : waitingQueueTokens.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
              <Clock size={32} style={{ color: '#cbd5e1', margin: '0 auto 10px' }} />
              <h5 style={{ fontWeight: 800, color: '#334155', margin: '0 0 4px 0' }}>No Waiting Patients</h5>
              <p style={{ fontSize: '0.8rem', margin: 0 }}>
                Live queue is clear. Finished visits are under the <strong>Completed</strong> tab.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {waitingQueueTokens.map((t) => {
                const isSelected = activeToken?.token_id === t.token_id;
                const isRed = (t.priority || '').toUpperCase().includes('RED');
                const isAmber = (t.priority || '').toUpperCase().includes('AMBER');
                const prioColor = isRed ? '#b91c1c' : isAmber ? '#b45309' : '#15803d';
                const prioBg = isRed ? '#fef2f2' : isAmber ? '#fffbeb' : '#f0fdf4';

                const isInConsult = t.status === 'IN_CONSULTATION';
                const isCalled = t.status === 'CALLED';
                const isWaiting = t.status === 'WAITING';
                const isCompleted = t.status === 'COMPLETED';

                return (
                  <div
                    key={t.token_id}
                    onClick={() => selectPatientForConsultation(t)}
                    style={{
                      border: `1.5px solid ${isSelected ? '#059669' : isInConsult ? '#86efac' : isCalled ? '#fde047' : '#e2e8f0'}`,
                      background: isSelected ? '#f0fdf4' : isInConsult ? '#f0fdf4' : isCalled ? '#fefce8' : '#ffffff',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(5, 150, 105, 0.12)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.86rem', fontWeight: 900, background: '#0f172a', color: '#ffffff', padding: '2px 8px', borderRadius: '4px' }}>
                          {t.token_number}
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 7px', borderRadius: '8px', background: prioBg, color: prioColor }}>
                          {t.priority}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'right' }}>
                        {isCompleted ? (
                          <>
                            Done<br />
                            {formatUtcDate(t.completed_at || t.updated_at || t.created_at)}<br />
                            {formatUtcTime(t.completed_at || t.updated_at || t.created_at)}
                          </>
                        ) : (
                          formatUtcTime(t.created_at)
                        )}
                      </span>
                    </div>

                    <div style={{ marginBottom: '6px' }}>
                      <strong style={{ fontSize: '0.92rem', color: '#0f172a', display: 'block' }}>
                        {t.patient_name}
                      </strong>
                      <p style={{ fontSize: '0.78rem', color: '#475569', margin: '2px 0 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        "{t.chief_complaint}"
                      </p>
                      {isCompleted && (
                        <p style={{ fontSize: '0.74rem', color: '#047857', margin: '4px 0 0', fontWeight: 700 }}>
                          COMPLETED · {formatUtcDate(t.completed_at || t.created_at)} · {formatUtcTime(t.completed_at || t.created_at)}
                          {t.prescription_id ? ` · Rx ${t.prescription_id}` : ''}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginTop: '6px' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: isInConsult ? '#dcfce7' : isCalled ? '#fef08a' : isCompleted ? '#f1f5f9' : '#e0f2fe',
                        color: isInConsult ? '#166534' : isCalled ? '#854d0e' : isCompleted ? '#64748b' : '#0369a1'
                      }}>
                        {t.status}
                      </span>

                      {/* Action buttons on card */}
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                        {(isWaiting || isCalled) && (
                          <button
                            type="button"
                            onClick={() => handleCallPatient(t)}
                            disabled={actionLoadingId === t.token_id || !canCallToken(t)}
                            className="btn btn-outline"
                            style={{
                              padding: '3px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              opacity: canCallToken(t) ? 1 : 0.45,
                              cursor: canCallToken(t) ? 'pointer' : 'not-allowed',
                            }}
                            title={canCallToken(t) ? (isCalled ? 'Recall patient' : 'Call next in line') : 'Locked — call next in line first'}
                          >
                            <Volume2 size={11} style={{ marginRight: '2px' }} /> {isCalled ? 'Recall' : (canCallToken(t) ? 'Call' : 'Later')}
                          </button>
                        )}
                        {(isWaiting || isCalled) && canCallToken(t) && (
                          <button
                            type="button"
                            onClick={() => handleStartConsultation(t)}
                            disabled={actionLoadingId === t.token_id}
                            className="btn btn-primary"
                            style={{ padding: '3px 9px', fontSize: '0.72rem', fontWeight: 700, background: '#059669', borderColor: '#059669' }}
                            title="Start consultation"
                          >
                            <Play size={11} style={{ marginRight: '2px' }} /> Consult
                          </button>
                        )}
                        {(isWaiting || isCalled) && canCallToken(t) && (
                          <button
                            type="button"
                            onClick={() => handleSkipPatient(t)}
                            disabled={actionLoadingId === t.token_id}
                            className="btn btn-outline"
                            style={{ padding: '3px 7px', fontSize: '0.72rem', fontWeight: 700, color: '#b45309', borderColor: '#fde68a' }}
                            title="Mark patient as absent (15-min grace window)"
                          >
                            <FastForward size={11} style={{ marginRight: '2px' }} /> Skip
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* ==================================================== */}
        {/* TAB: COMPLETED HISTORY                               */}
        {/* ==================================================== */}
        {deskTab === 'completed' && (
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '1px solid #e2e8f0', paddingBottom: 10, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Completed consultations</h3>
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                Read-only history · {filteredCompletedTokens.length} shown
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'range', label: 'Date range' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setCompletedFilter(f.id)}
                  className="btn btn-outline"
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    padding: '5px 10px',
                    background: completedFilter === f.id ? '#ecfdf5' : '#fff',
                    borderColor: completedFilter === f.id ? '#6ee7b7' : '#e2e8f0',
                    color: completedFilter === f.id ? '#047857' : '#475569',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {completedFilter === 'range' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                From{' '}
                <input type="date" value={completedFrom} onChange={(e) => setCompletedFrom(e.target.value)} className="filter-select" style={{ marginLeft: 4 }} />
              </label>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                To{' '}
                <input type="date" value={completedTo} onChange={(e) => setCompletedTo(e.target.value)} className="filter-select" style={{ marginLeft: 4 }} />
              </label>
            </div>
          )}

          {filteredCompletedTokens.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
              <CheckCircle2 size={32} style={{ color: '#cbd5e1', margin: '0 auto 10px' }} />
              <h5 style={{ fontWeight: 800, color: '#334155', margin: '0 0 4px 0' }}>No completed visits for this filter</h5>
              <p style={{ fontSize: '0.8rem', margin: 0 }}>Try Today, Yesterday, or a wider date range.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredCompletedTokens.map((t) => (
                <div
                  key={t.token_id}
                  style={{
                    border: '1.5px solid #e2e8f0',
                    background: '#ffffff',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 900, background: '#0f172a', color: '#fff', padding: '2px 8px', borderRadius: 4 }}>
                        {t.token_number}
                      </span>
                      <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{t.patient_name}</strong>
                    </div>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#047857', textAlign: 'right' }}>
                      COMPLETED<br />
                      {formatUtcDate(t.completed_at || t.created_at)} · {formatUtcTime(t.completed_at || t.created_at)}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#475569', margin: '0 0 10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    &ldquo;{t.chief_complaint}&rdquo;
                    {t.clinical_diagnosis ? <> · Dx: {t.clinical_diagnosis}</> : null}
                    {t.prescription_id ? <> · Rx {t.prescription_id}</> : null}
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-outline" style={{ fontSize: '0.74rem', fontWeight: 700 }} onClick={() => openCompletedRecord(t)}>
                      <FileText size={12} style={{ marginRight: 4 }} /> View details
                    </button>
                    <button type="button" className="btn btn-primary" style={{ fontSize: '0.74rem', fontWeight: 700, background: '#059669', borderColor: '#059669' }} onClick={() => openCompletedPrescription(t)}>
                      <Pill size={12} style={{ marginRight: 4 }} /> View / download Rx
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* ==================================================== */}
        {/* TAB: PATIENT CONSULTATION DETAILS                    */}
        {/* ==================================================== */}
        {deskTab === 'consultation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {!activeToken ? (
            <div className="card" style={{ padding: '60px 24px', textAlign: 'center', color: '#64748b' }}>
              <div style={{ width: '64px', height: '64px', background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid #e2e8f0' }}>
                <ClipboardList size={30} style={{ color: '#94a3b8' }} />
              </div>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#334155', margin: '0 0 6px 0' }}>
                No patient opened
              </h4>
              <p style={{ fontSize: '0.86rem', maxWidth: '420px', margin: '0 auto 18px', lineHeight: 1.5 }}>
                Go to <strong>Waiting patients</strong>, then Call or Consult a token to open their clinical dossier here.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => setDeskTab('queue')}>
                Open waiting list
              </button>
            </div>
          ) : (
            <>
              {/* Patient Dossier & AI Triage Intelligence Card */}
              <div className="card" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 900, background: '#0f172a', color: '#ffffff', padding: '3px 10px', borderRadius: '6px' }}>
                        TOKEN: {activeToken.token_number}
                      </span>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                        {activeToken.patient_name}
                      </h3>
                      {activeToken.patient_uhid && (
                        <span style={{ fontSize: '0.74rem', background: '#e0f2fe', color: '#0369a1', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                          UHID: {activeToken.patient_uhid}
                        </span>
                      )}
                    </div>
                    <p style={{ color: '#64748b', fontSize: '0.84rem', margin: '4px 0 0 0' }}>
                      Intake Chamber: <strong>{activeToken.assigned_room || 'Room 101'}</strong> • Triage Urgency: <strong style={{ color: activeToken.priority === 'RED' ? '#b91c1c' : '#b45309' }}>{activeToken.priority}</strong>
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {isActiveCompleted && (
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '6px 10px', borderRadius: 8 }}>
                        COMPLETED · read-only · {formatUtcDate(activeToken.completed_at || activeToken.created_at)} · {formatUtcTime(activeToken.completed_at || activeToken.created_at)}
                      </span>
                    )}
                    {!isActiveCompleted && activeToken.status !== 'IN_CONSULTATION' && canCallToken(activeToken) && (
                      <button
                        type="button"
                        onClick={() => handleCallPatient(activeToken)}
                        disabled={actionLoadingId === activeToken.token_id}
                        className="btn btn-outline"
                        style={{ padding: '6px 12px', fontSize: '0.82rem', fontWeight: 700 }}
                      >
                        <Volume2 size={13} style={{ marginRight: '4px' }} />
                        {activeToken.status === 'CALLED' ? 'Recall Patient' : 'Call to Chamber'}
                      </button>
                    )}
                    {!isActiveCompleted && activeToken.status === 'WAITING' && !canCallToken(activeToken) && (
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '6px 10px', borderRadius: 8 }}>
                        Not next in line — call {nextCallableToken?.token_number || 'the head of queue'} first
                      </span>
                    )}
                    {!isActiveCompleted && activeToken.status !== 'IN_CONSULTATION' && canCallToken(activeToken) && (
                      <button
                        type="button"
                        onClick={() => handleStartConsultation(activeToken)}
                        disabled={actionLoadingId === activeToken.token_id}
                        className="btn btn-primary"
                        style={{ background: '#059669', borderColor: '#059669', padding: '6px 14px', fontSize: '0.82rem', fontWeight: 700 }}
                      >
                        <Play size={13} style={{ marginRight: '4px' }} /> Start Consultation
                      </button>
                    )}
                    {!isActiveCompleted && (activeToken.status === 'WAITING' || activeToken.status === 'CALLED') && canCallToken(activeToken) && (
                      <button
                        type="button"
                        onClick={() => handleSkipPatient(activeToken)}
                        disabled={actionLoadingId === activeToken.token_id}
                        className="btn btn-outline"
                        style={{ padding: '6px 12px', fontSize: '0.82rem', fontWeight: 700, color: '#b45309', borderColor: '#fde68a' }}
                      >
                        <FastForward size={13} style={{ marginRight: '4px' }} /> Skip (Grace Period)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setActiveToken(null); setDeskTab(isActiveCompleted ? 'completed' : 'queue'); }}
                      className="btn btn-outline"
                      style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                    >
                      <X size={14} /> Close
                    </button>
                    {isActiveCompleted ? (
                      <button
                        type="button"
                        onClick={() => openCompletedPrescription(activeToken)}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '0.82rem', fontWeight: 700, background: '#059669', borderColor: '#059669' }}
                      >
                        <Pill size={13} style={{ marginRight: 4 }} /> View prescription
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeskTab('prescription')}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '0.82rem', fontWeight: 700, background: '#059669', borderColor: '#059669' }}
                      >
                        <Pill size={13} style={{ marginRight: 4 }} /> Write prescription
                      </button>
                    )}
                  </div>
                </div>

                {/* Chief Complaint Statement */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                    Presenting Chief Complaint:
                  </span>
                  <p style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                    "{activeToken.chief_complaint}"
                  </p>
                </div>

                {/* AI Semantic Triage Extraction & Differential Conditions */}
                {activeToken.extracted_entities && (
                  <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '14px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <Sparkles size={15} style={{ color: '#7c3aed' }} />
                      <strong style={{ fontSize: '0.82rem', color: '#6d28d9', textTransform: 'uppercase' }}>
                        AI Clinical Semantic Triage Findings (CUMC / SymCat Benchmark):
                      </strong>
                    </div>

                    {/* Active Symptoms chips */}
                    {activeToken.extracted_entities.confirmed_symptoms?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                        {activeToken.extracted_entities.confirmed_symptoms.map((s, idx) => (
                          <span key={idx} style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>
                            ✓ {s.canonical_name} ({s.anatomical_region})
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Differential conditions */}
                    {activeToken.extracted_entities.correlated_conditions?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {activeToken.extracted_entities.correlated_conditions.slice(0, 2).map((c, idx) => (
                          <span
                            key={idx}
                            onClick={() => {
                              setRxForm((prev) => ({
                                ...prev,
                                clinical_diagnosis: c.condition,
                                icd10_code: c.icd10
                              }));
                            }}
                            title="Click to adopt as primary clinical diagnosis"
                            style={{ background: '#ffffff', color: '#4338ca', border: '1px solid #c7d2fe', fontSize: '0.76rem', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            ICD-10 {c.icd10}: {c.condition} ({c.match_score_pct}% Match) 👆
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Rotterdam 2003 Consensus Alert for Doctor */}
                    {activeToken.extracted_entities.pcod_evaluation?.is_pcod_suspected && (
                      <div style={{ marginTop: '10px', background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: '6px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Sparkles size={14} style={{ color: '#7c3aed' }} /> ROTTERDAM 2003 CONSENSUS: PCOD SUSPECTED
                          </span>
                          <span style={{ fontSize: '0.72rem', background: '#7c3aed', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                            {activeToken.extracted_entities.pcod_evaluation.rotterdam_cluster_count} Clusters Confirmed
                          </span>
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#581c87', marginBottom: '8px' }}>
                          {activeToken.extracted_entities.pcod_evaluation.xai_clinical_rationale}
                        </div>
                        <button
                          type="button"
                          onClick={handleAdoptRotterdamWorkup}
                          style={{
                            background: '#7c3aed',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <CheckCircle2 size={13} /> Adopt Rotterdam Diagnostic Workup (5 Lab Tests) into Prescription Orders
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Longitudinal patient history for doctor */}
              <div className="card" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <strong style={{ color: '#0f172a' }}>Patient visit history</strong>
                  {loadingHistory && <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Loading…</span>}
                </div>
                {!patientHistory?.consultations?.length && !patientHistory?.prescriptions?.length && !loadingHistory && (
                  <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b' }}>No prior visits on record for this patient.</p>
                )}
                {(patientHistory?.consultations || []).slice(0, 6).map((c) => {
                  const done = String(c.status || '').toLowerCase() === 'completed';
                  return (
                    <div key={c.id || c.created_at} style={{ borderTop: '1px solid #e2e8f0', padding: '10px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.86rem', color: '#0f172a' }}>{c.department || 'OPD'}</strong>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: done ? '#047857' : '#64748b' }}>
                          {c.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 4, lineHeight: 1.45 }}>
                        Submitted: {formatUtcDate(c.created_at)} · {formatUtcTime(c.created_at)}
                        {c.completed_at ? <><br />Completed: {formatUtcDate(c.completed_at)} · {formatUtcTime(c.completed_at)}</> : null}
                        {c.token_number ? <><br />Token {c.token_number}</> : null}
                        {c.clinical_diagnosis ? <><br />Dx: {c.clinical_diagnosis}</> : null}
                      </div>
                      {(c.prescription_id || c.prescription) && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ marginTop: 6, fontSize: '0.75rem' }}
                          onClick={async () => {
                            try {
                              const id = c.prescription_id || c.prescription?.prescription_id;
                              if (id) {
                                const res = await api.get(`/doctor-desk/prescriptions/${id}`);
                                setIssuedRxModal(res.data);
                              }
                            } catch {
                              showAlert('Could not open past prescription.', 'error');
                            }
                          }}
                        >
                          <Pill size={12} /> View past Rx
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Clinical diagnosis & measures — consultation tab (synced with Rx form) */}
              {!isActiveCompleted && (
                <div className="card" style={{ padding: '20px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                        Clinical diagnosis &amp; measures taken
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                        Document impression, ICD-10, examination findings, and measures taken. These carry into Digital prescription.
                      </p>
                    </div>
                    {activeToken.status === 'IN_CONSULTATION' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: '0.8rem', background: '#059669', borderColor: '#059669' }}
                        onClick={() => setDeskTab('prescription')}
                      >
                        <Pill size={13} /> Continue to prescription
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginBottom: 14 }}>
                    <div className="form-field-group">
                      <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
                        Clinical Diagnosis / Impression <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={rxForm.clinical_diagnosis}
                        onChange={(e) => setRxForm({ ...rxForm, clinical_diagnosis: e.target.value })}
                        placeholder="e.g. Acute Pharyngotonsillitis / Suspected PCOS (E28.2)"
                        className="filter-select"
                        style={{ width: '100%', padding: '9px 12px', fontSize: '0.86rem' }}
                        disabled={activeToken.status !== 'IN_CONSULTATION'}
                      />
                    </div>
                    <div className="form-field-group">
                      <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
                        WHO ICD-10
                      </label>
                      <input
                        type="text"
                        value={rxForm.icd10_code}
                        onChange={(e) => setRxForm({ ...rxForm, icd10_code: e.target.value })}
                        placeholder="e.g. E28.2"
                        className="filter-select"
                        style={{ width: '100%', padding: '9px 12px', fontSize: '0.86rem' }}
                        disabled={activeToken.status !== 'IN_CONSULTATION'}
                      />
                    </div>
                  </div>

                  <div className="form-field-group">
                    <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
                      Examination findings &amp; measures taken
                    </label>
                    <textarea
                      rows={4}
                      value={rxForm.clinical_notes}
                      onChange={(e) => setRxForm({ ...rxForm, clinical_notes: e.target.value })}
                      placeholder="Vitals, examination findings, counselling given, investigations advised, measures taken during this consult..."
                      className="filter-select"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', resize: 'vertical' }}
                      disabled={activeToken.status !== 'IN_CONSULTATION'}
                    />
                  </div>

                  {activeToken.status !== 'IN_CONSULTATION' && (
                    <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: '#b45309' }}>
                      Click <strong>Start Consultation</strong> above to enable diagnosis and measures entry.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        )}

        {/* ==================================================== */}
        {/* TAB: DIGITAL PRESCRIPTION                            */}
        {/* ==================================================== */}
        {deskTab === 'prescription' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!activeToken ? (
            <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
              <p style={{ marginBottom: 14 }}>Open a patient from Waiting patients before writing a prescription.</p>
              <button type="button" className="btn btn-primary" onClick={() => setDeskTab('queue')}>Go to waiting list</button>
            </div>
          ) : isActiveCompleted ? (
            <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
              <CheckCircle2 size={28} style={{ color: '#059669', margin: '0 auto 10px' }} />
              <h4 style={{ color: '#0f172a', margin: '0 0 8px' }}>Visit already completed</h4>
              <p style={{ marginBottom: 14, fontSize: '0.88rem' }}>
                Prescription cannot be edited. Open the issued slip from Completed history.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={() => openCompletedPrescription(activeToken)}>View / download Rx</button>
                <button type="button" className="btn btn-outline" onClick={() => setDeskTab('completed')}>Back to Completed</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontSize: '0.88rem', color: '#334155' }}>
                  Prescribing for <strong>{activeToken.patient_name}</strong> · Token <strong>{activeToken.token_number}</strong>
                </div>
                <button type="button" className="btn btn-outline" onClick={() => setDeskTab('consultation')} style={{ fontSize: '0.8rem' }}>
                  ← Back to consultation
                </button>
              </div>
              {/* Digital Prescription Builder (Rx) Form */}
              <form onSubmit={handleIssuePrescription} className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', background: '#ecfdf5', color: '#059669', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Pill size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, color: '#0f172a' }}>
                        Digital Prescription (Rx) Builder
                      </h3>
                      <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Structured medication ordering, clinical notes & follow-up scheduling
                      </span>
                    </div>
                  </div>
                </div>

                {/* 1. Clinical Diagnosis & ICD-10 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '14px', marginBottom: '16px' }}>
                  <div className="form-field-group">
                    <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
                      Clinical Diagnosis / Impression <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={rxForm.clinical_diagnosis}
                      onChange={(e) => setRxForm({ ...rxForm, clinical_diagnosis: e.target.value })}
                      placeholder="e.g. Acute Pharyngotonsillitis with High Pyrexia"
                      required
                      className="filter-select"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '0.86rem' }}
                    />
                  </div>

                  <div className="form-field-group">
                    <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
                      WHO ICD-10 Code
                    </label>
                    <input
                      type="text"
                      value={rxForm.icd10_code}
                      onChange={(e) => setRxForm({ ...rxForm, icd10_code: e.target.value })}
                      placeholder="e.g. J02.9"
                      className="filter-select"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '0.86rem' }}
                    />
                  </div>
                </div>

                {/* 2. Clinical Findings & Examination Notes */}
                <div className="form-field-group" style={{ marginBottom: '18px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
                    Clinical Findings & Physical Examination Notes
                  </label>
                  <textarea
                    rows={2}
                    value={rxForm.clinical_notes}
                    onChange={(e) => setRxForm({ ...rxForm, clinical_notes: e.target.value })}
                    placeholder="Physical examination notes, vitals observed, chest clear, throat examination..."
                    className="filter-select"
                    style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', resize: 'vertical' }}
                  />
                </div>

                {/* 3. Structured Medications Table */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>
                      💊 Prescribed Medications (Rx Table):
                    </span>
                    <button
                      type="button"
                      onClick={handleAddMedicationRow}
                      className="btn btn-outline"
                      style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', borderColor: '#a7f3d0' }}
                    >
                      <Plus size={14} /> Add Medicine Row
                    </button>
                  </div>

                  {/* Quick-add chips */}
                  <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                      ⚡ 1-Click Common Hospital Formulary Meds:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {COMMON_QUICK_MEDS.map((med, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleQuickAddMed(med)}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            color: '#334155',
                            cursor: 'pointer'
                          }}
                        >
                          + {med.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dynamic medication rows */}
                  <div className="rx-med-list">
                    {rxForm.medications.map((med, idx) => (
                      <div
                        key={idx}
                        className="rx-med-row"
                      >
                        <input
                          type="text"
                          value={med.medicine_name}
                          onChange={(e) => handleMedChange(idx, 'medicine_name', e.target.value)}
                          placeholder="Drug Name (e.g. Paracetamol)"
                          className="filter-select"
                          style={{ padding: '7px 10px', fontSize: '0.82rem' }}
                          required
                        />

                        <input
                          type="text"
                          value={med.dosage}
                          onChange={(e) => handleMedChange(idx, 'dosage', e.target.value)}
                          placeholder="Dosage (500mg)"
                          className="filter-select"
                          style={{ padding: '7px 10px', fontSize: '0.82rem' }}
                        />

                        <select
                          value={med.frequency}
                          onChange={(e) => handleMedChange(idx, 'frequency', e.target.value)}
                          className="filter-select"
                          style={{ padding: '7px 8px', fontSize: '0.82rem' }}
                        >
                          <option value="1-0-1">1-0-1 (BD)</option>
                          <option value="1-0-0">1-0-0 (OD-M)</option>
                          <option value="0-0-1">0-0-1 (OD-N)</option>
                          <option value="1-1-1">1-1-1 (TDS)</option>
                          <option value="SOS">SOS (As Needed)</option>
                        </select>

                        <select
                          value={med.timing}
                          onChange={(e) => handleMedChange(idx, 'timing', e.target.value)}
                          className="filter-select"
                          style={{ padding: '7px 8px', fontSize: '0.82rem' }}
                        >
                          <option value="After Food">After Food</option>
                          <option value="Before Food">Before Food</option>
                          <option value="With Food">With Food</option>
                          <option value="At Bedtime">At Bedtime</option>
                        </select>

                        <input
                          type="text"
                          value={med.duration}
                          onChange={(e) => handleMedChange(idx, 'duration', e.target.value)}
                          placeholder="Duration (5 Days)"
                          className="filter-select"
                          style={{ padding: '7px 8px', fontSize: '0.82rem' }}
                        />

                        <input
                          type="text"
                          value={med.instructions}
                          onChange={(e) => handleMedChange(idx, 'instructions', e.target.value)}
                          placeholder="Instructions (e.g. with water)"
                          className="filter-select"
                          style={{ padding: '7px 10px', fontSize: '0.82rem' }}
                        />

                        <button
                          type="button"
                          onClick={() => handleRemoveMedicationRow(idx)}
                          disabled={rxForm.medications.length <= 1}
                          className="btn-icon-action delete"
                          style={{ width: '32px', height: '32px' }}
                          title="Remove medicine"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Diagnostic Investigations Ordered */}
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '8px' }}>
                    <FlaskConical size={14} style={{ display: 'inline', marginRight: '4px' }} /> Diagnostic Tests Advised (Lab / Radiology Orders):
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {COMMON_INVESTIGATIONS.map((test, idx) => {
                      const isSelected = rxForm.investigations_advised.includes(test);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleToggleInvestigation(test)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: isSelected ? 800 : 600,
                            border: `1px solid ${isSelected ? '#0284c7' : '#cbd5e1'}`,
                            background: isSelected ? '#e0f2fe' : '#ffffff',
                            color: isSelected ? '#0369a1' : '#475569',
                            cursor: 'pointer'
                          }}
                        >
                          {isSelected ? '✓ ' : '+ '} {test}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Diet, Lifestyle Advice & Follow-Up Review Date */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                  <div className="form-field-group">
                    <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
                      Diet & Lifestyle Instructions
                    </label>
                    <input
                      type="text"
                      value={rxForm.diet_lifestyle_advice}
                      onChange={(e) => setRxForm({ ...rxForm, diet_lifestyle_advice: e.target.value })}
                      placeholder="e.g. Drink plenty of warm water, avoid heavy foods"
                      className="filter-select"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div className="form-field-group">
                    <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
                      <Calendar size={13} style={{ display: 'inline', marginRight: '4px' }} /> Next appointment date
                    </label>
                    <input
                      type="date"
                      value={rxForm.follow_up_on || ''}
                      onChange={(e) => {
                        const on = e.target.value;
                        setRxForm((prev) => ({
                          ...prev,
                          follow_up_on: on,
                          follow_up_date: on ? `Review on ${on} if symptoms persist` : prev.follow_up_date,
                        }));
                      }}
                      className="filter-select"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem' }}
                    />
                    <input
                      type="text"
                      value={rxForm.follow_up_date}
                      onChange={(e) => setRxForm({ ...rxForm, follow_up_date: e.target.value })}
                      placeholder="Advice e.g. Review after 5 days if fever persists"
                      className="filter-select"
                      style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', marginTop: 8 }}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Date schedules patient reminders (day before + day of). Advice prints on the Rx.
                    </span>
                  </div>
                </div>

                {/* Submit Action Button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                  <button
                    type="submit"
                    disabled={submittingRx}
                    className="btn btn-primary"
                    style={{
                      background: '#059669',
                      borderColor: '#059669',
                      padding: '12px 24px',
                      fontSize: '0.92rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <CheckCircle2 size={18} />
                    {submittingRx ? 'Signing & Issuing Rx...' : 'Sign & Issue Official Digital Prescription'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
        )}
      </div>

      {/* ========================================================== */}
      {/* 3. OFFICIAL DIGITAL PRESCRIPTION SLIP MODAL               */}
      {/* ========================================================== */}
      {issuedRxModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto', padding: '30px' }}>
            {/* Action Bar for Print & Close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <span style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> Digital Prescription Record Authenticated & Issued
              </span>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const ok = await downloadPrescriptionPdf(issuedRxModal);
                      if (!ok) throw new Error('pdf failed');
                      showAlert('Prescription PDF downloaded.');
                    } catch {
                      downloadPrescriptionFile(issuedRxModal);
                      showAlert('PDF failed — HTML slip downloaded as fallback.', 'error');
                    }
                  }}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                >
                  <Printer size={15} /> Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!openPrescriptionInNewTab(issuedRxModal)) {
                      downloadPrescriptionFile(issuedRxModal);
                      showAlert('Popup blocked — Rx file downloaded. Open the .html in Chrome/Edge to print PDF.', 'error');
                    }
                  }}
                  className="btn btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                >
                  Open in browser
                </button>
                <button
                  type="button"
                  onClick={() => setIssuedRxModal(null)}
                  className="btn btn-outline"
                  style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                >
                  Done
                </button>
              </div>
            </div>

            {/* Printable Prescription Template */}
            <div id="printable-prescription-slip" style={{ background: '#ffffff', border: '2px solid #0f172a', borderRadius: '8px', padding: '24px' }}>
              {/* Hospital Letterhead Header */}
              <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: '0.74rem', fontWeight: 900, color: '#0369a1', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    Government of Karnataka • Health & Family Welfare • Sushrutha Grid
                  </span>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', margin: '2px 0 0 0' }}>
                    {issuedRxModal.hospital_name || 'Victoria Hospital (BMCRI Apex Medical Center)'}
                  </h2>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    {issuedRxModal.hospital_address || 'Victoria Hospital, Mysore Rd, New Tharagupet, Bengaluru 560002'}
                  </p>
                  {issuedRxModal.hospital_phone && (
                    <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0 0' }}>
                      Phone: {issuedRxModal.hospital_phone}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '3px 10px', borderRadius: '4px', display: 'inline-block' }}>
                    {issuedRxModal.prescription_id}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                    Issued: {formatUtcDate(issuedRxModal.issued_at)} • {formatUtcTime(issuedRxModal.issued_at)}
                  </span>
                </div>
              </div>

              {/* Doctor & Patient Metadata Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', marginBottom: '18px', border: '1px solid #e2e8f0', fontSize: '0.84rem' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800 }}>Prescribing Physician</span>
                  <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.94rem' }}>{issuedRxModal.doctor_name}</strong>
                  <span style={{ color: '#475569', fontSize: '0.78rem' }}>
                    {issuedRxModal.doctor_qualification} • {issuedRxModal.department} ({issuedRxModal.room_number})
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '0.72rem', display: 'block' }}>
                    Reg No: {issuedRxModal.doctor_registration_no || 'KMC-2024-88910'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800 }}>Patient Details</span>
                  <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.94rem' }}>{issuedRxModal.patient_name}</strong>
                  <span style={{ color: '#475569', fontSize: '0.78rem' }}>
                    {issuedRxModal.patient_uhid ? `UHID: ${issuedRxModal.patient_uhid}` : 'OPD Walk-in'} • Token: <strong>{issuedRxModal.token_number || 'OPD'}</strong>
                  </span>
                </div>
              </div>

              {/* Diagnosis */}
              <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px dashed #cbd5e1' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                  Clinical Diagnosis:
                </span>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', margin: '3px 0 0 0' }}>
                  {issuedRxModal.clinical_diagnosis} {issuedRxModal.icd10_code ? `(WHO ICD-10: ${issuedRxModal.icd10_code})` : ''}
                </h4>
                {issuedRxModal.clinical_notes && (
                  <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 0 0', fontStyle: 'italic' }}>
                    "{issuedRxModal.clinical_notes}"
                  </p>
                )}
              </div>

              {/* Rx Table */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#059669', fontFamily: 'serif' }}>℞</span>
                  <strong style={{ fontSize: '0.88rem', color: '#0f172a', textTransform: 'uppercase' }}>Medications Prescribed:</strong>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800 }}>#</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800 }}>Medicine & Strength</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800 }}>Dosage</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800 }}>Schedule (M-A-N)</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800 }}>Timing</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800 }}>Duration</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800 }}>Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issuedRxModal.medications.map((m, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 800, color: '#0f172a' }}>{m.medicine_name}</td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{m.dosage}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#059669' }}>{m.frequency}</td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{m.timing}</td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{m.duration}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '0.78rem' }}>{m.instructions || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Diagnostic Orders & Lifestyle */}
              {(issuedRxModal.investigations_advised?.length > 0 || issuedRxModal.diet_lifestyle_advice || issuedRxModal.follow_up_date) && (
                <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '20px', fontSize: '0.82rem' }}>
                  {issuedRxModal.investigations_advised?.length > 0 && (
                    <div style={{ marginBottom: '6px' }}>
                      <strong style={{ color: '#0f172a' }}>Diagnostic Investigations Ordered: </strong>
                      <span style={{ color: '#0369a1' }}>{issuedRxModal.investigations_advised.join(', ')}</span>
                    </div>
                  )}
                  {issuedRxModal.diet_lifestyle_advice && (
                    <div style={{ marginBottom: '6px' }}>
                      <strong style={{ color: '#0f172a' }}>Diet / Lifestyle Advice: </strong>
                      <span style={{ color: '#475569' }}>{issuedRxModal.diet_lifestyle_advice}</span>
                    </div>
                  )}
                  {issuedRxModal.follow_up_date && (
                    <div>
                      <strong style={{ color: '#0f172a' }}>Follow-up Advice: </strong>
                      <span style={{ color: '#15803d', fontWeight: 700 }}>{issuedRxModal.follow_up_date}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Doctor Digital Stamp / Signature + brand seal note */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '24px', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.72rem', color: '#0f766e', maxWidth: 260, lineHeight: 1.4 }}>
                  <strong>Sushrutha Grid official seal</strong><br />
                  Common brand seal across all grid hospitals · hospital letterhead above is tenant-specific.
                </div>
                <div style={{ textAlign: 'center', borderTop: '1px solid #0f172a', paddingTop: '6px', width: '240px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 800, display: 'block' }}>
                    ✓ DIGITALLY SIGNED
                  </span>
                  <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>{issuedRxModal.doctor_name}</strong>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>
                    {issuedRxModal.digital_signature || 'Authorized via Sushrutha Grid'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
