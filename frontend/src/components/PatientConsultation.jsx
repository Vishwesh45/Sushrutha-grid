import React, { useState, useEffect } from 'react';
import {
  Home, MapPin, ClipboardList, FolderOpen, LogIn, LogOut, UserCheck,
  Navigation, Building2, ExternalLink, KeyRound, Lock, CheckCircle2,
  Send, Stethoscope, Pill, Printer, X, RotateCw, ArrowRight, Calendar,
  MessageCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import VoiceRecorder from './VoiceRecorder';
import UnifiedAuthModal from './UnifiedAuthModal';
import { useHospitalWebSocket, playHospitalChime } from '../services/useHospitalWebSocket';
import { downloadPrescriptionFile, openPrescriptionInNewTab, downloadPrescriptionPdf } from '../utils/prescriptionDownload';
import PatientReviewPage from './PatientReviewPage';
import PatientAssistantPanel from './PatientAssistantPanel';
import { ReceptionDeskCodePanel, LiveOpdWhosNextPanel } from './LiveOperationalDesk';
import { extractDurationFromText, extractSeverityHint } from '../utils/symptomParse';
import './PatientModule.css';

const VICTORIA_ID = 'HOSP-BLR-001';
const VICTORIA_NAME = 'Victoria Hospital (BMCRI Apex Medical Center)';

const applyComplaintDerivedFields = (prev, complaint) => {
  const duration = extractDurationFromText(complaint);
  const severityHint = extractSeverityHint(complaint);
  return {
    ...prev,
    chief_complaint: complaint,
    // Live-fill duration whenever the prompt mentions time; clear when wording drops it
    duration: duration || (prev._durationManual ? prev.duration : ''),
    ...(severityHint && !prev._severityManual ? { severity: severityHint } : {}),
  };
};

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

const priorityLabel = (priority) => {
  const p = (priority || '').toUpperCase();
  if (p.includes('RED')) return { text: 'Emergency', color: '#b91c1c', bg: '#fef2f2' };
  if (p.includes('AMBER')) return { text: 'Urgent', color: '#b45309', bg: '#fffbeb' };
  return { text: 'Routine', color: '#047857', bg: '#ecfdf5' };
};

/** Map legacy screen ids → primary hub + sub-tab */
const screenToNav = (screen) => {
  switch (screen) {
    case 'visit':
    case 'assistant':
    case 'followups':
      return { primary: 'care', care: screen === 'visit' ? 'visit' : screen };
    case 'nearby':
    case 'liveopd':
    case 'desk':
      return { primary: 'find', find: screen };
    case 'records':
    case 'reviews':
      return { primary: 'me', me: screen };
    case 'home':
    default:
      return { primary: 'home' };
  }
};

export default function PatientConsultation() {
  const { user, isAuthenticated, logout } = useAuth();
  // 4 hubs only in the main nav — secondary screens live under Care / Find / Me
  const [primaryNav, setPrimaryNav] = useState('home');
  const [careSub, setCareSub] = useState('visit');
  const [findSub, setFindSub] = useState('nearby');
  const [meSub, setMeSub] = useState('records');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const setActiveTab = (screen) => {
    const nav = screenToNav(screen);
    setPrimaryNav(nav.primary);
    if (nav.care) setCareSub(nav.care);
    if (nav.find) setFindSub(nav.find);
    if (nav.me) setMeSub(nav.me);
  };

  const activeTab = primaryNav === 'home'
    ? 'home'
    : primaryNav === 'care'
      ? careSub
      : primaryNav === 'find'
        ? findSub
        : meSub;
  const [viewingRx, setViewingRx] = useState(null);
  const [followUpDash, setFollowUpDash] = useState({
    upcoming: [],
    past: [],
    due_reminders: [],
    total_upcoming: 0,
    total_past: 0,
    total_due_reminders: 0,
  });
  const [followUpLoading, setFollowUpLoading] = useState(false);

  const [selectedHospital, setSelectedHospital] = useState(() => {
    try {
      const saved = localStorage.getItem('sushrutha_selected_hospital');
      return saved ? JSON.parse(saved) : { hospital_id: VICTORIA_ID, name: VICTORIA_NAME, is_grid_pilot: true };
    } catch {
      return { hospital_id: VICTORIA_ID, name: VICTORIA_NAME, is_grid_pilot: true };
    }
  });
  const [userLocation, setUserLocation] = useState(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [nearbyHospitalsList, setNearbyHospitalsList] = useState([]);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [gpsAccuracyM, setGpsAccuracyM] = useState(null);
  const [gpsHint, setGpsHint] = useState(null);

  const [checkinStatus, setCheckinStatus] = useState(null);
  const [checkinCode, setCheckinCode] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinError, setCheckinError] = useState(null);
  const isVisitUnlocked = Boolean(checkinStatus?.checked_in);

  // hospital → A symptoms → B confirm → C live token (COMPLETED never locks this)
  const [visitStep, setVisitStep] = useState('hospital');
  const [formData, setFormData] = useState({
    chief_complaint: '',
    severity: 'moderate',
    duration: '',
    functional_difficulty: '',
    additional_notes: '',
    _durationManual: false,
    _severityManual: false,
  });
  const LIVE_TOKEN_STATUSES = new Set(['WAITING', 'CALLED', 'IN_CONSULTATION', 'SKIPPED']);
  const isLiveQueueToken = (t) => LIVE_TOKEN_STATUSES.has(String(t?.status || '').toUpperCase());
  const [semanticPreview, setSemanticPreview] = useState(null);
  const [deptAvailability, setDeptAvailability] = useState(null);
  const [analyzingNlp, setAnalyzingNlp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [voiceResetKey, setVoiceResetKey] = useState(0);
  const [referralResult, setReferralResult] = useState(null);

  const [consultations, setConsultations] = useState([]);
  const [myReviews, setMyReviews] = useState([]);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [expandedRecordId, setExpandedRecordId] = useState(null);
  const [reviewFocusVisitId, setReviewFocusVisitId] = useState(null);
  const [callingAlert, setCallingAlert] = useState(null);
  const [rxReadyAlert, setRxReadyAlert] = useState(null);
  const [activePatientToken, setActivePatientToken] = useState(null);
  const [rejoiningQueue, setRejoiningQueue] = useState(false);

  const saveHospital = (hospital) => {
    setSelectedHospital(hospital);
    try { localStorage.setItem('sushrutha_selected_hospital', JSON.stringify(hospital)); } catch {}
  };

  const fetchNearby = async (lat, lon) => {
    const res = await api.get(`/hospitals/nearby?lat=${lat}&lon=${lon}&radius_km=25.0`);
    setNearbyHospitalsList(res.data || []);
    return res.data || [];
  };

  const applyGpsPosition = async (pos) => {
    const { latitude, longitude, accuracy } = pos.coords;
    setUserLocation({ lat: latitude, lon: longitude });
    setGpsAccuracyM(typeof accuracy === 'number' ? accuracy : null);
    // Cursor / coarse IP GPS often lands kilometres away — warn instead of trusting a huge km figure
    if (typeof accuracy === 'number' && accuracy > 2000) {
      setGpsHint('GPS accuracy is coarse (city-level). Distances may look wrong — tap Use my location outdoors, or ignore km until precise.');
    } else {
      setGpsHint(null);
    }
    try {
      const list = await fetchNearby(latitude, longitude);
      const victoria = list.find((h) => h.hospital_id === VICTORIA_ID || h.is_grid_pilot);
      if (victoria) {
        // Only auto-save hospital identity — do not treat inflated distance as truth on Consult
        saveHospital({
          hospital_id: victoria.hospital_id || VICTORIA_ID,
          name: victoria.name || VICTORIA_NAME,
          is_grid_pilot: true,
          address: victoria.address,
        });
        if (victoria.distance_km != null && victoria.distance_km > 12) {
          setGpsHint((prev) => prev || `Reported ${Number(victoria.distance_km).toFixed(1)} km to Victoria looks too far — refresh precise GPS on the Nearby tab.`);
        }
      }
      return list;
    } catch (e) {
      console.warn('Nearby fetch failed:', e);
      return [];
    }
  };

  const handleUseMyLocation = () => {
    setFetchingLocation(true);
    setLocationDenied(false);
    setGpsHint(null);
    if (!navigator.geolocation) {
      setLocationDenied(true);
      setFetchingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await applyGpsPosition(pos);
        setFetchingLocation(false);
      },
      () => {
        setLocationDenied(true);
        setUserLocation(null);
        setNearbyHospitalsList([]);
        setGpsAccuracyM(null);
        setFetchingLocation(false);
      },
      { timeout: 12000, enableHighAccuracy: true, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => { await applyGpsPosition(pos); },
        () => setLocationDenied(true),
        { timeout: 12000, enableHighAccuracy: true, maximumAge: 0 }
      );
    }
  }, []);

  const formatNearbyDistance = (km) => {
    if (km == null || Number.isNaN(Number(km))) return null;
    // Hide absurd readings from coarse/wrong GPS (common inside Cursor / VPN)
    if (gpsAccuracyM != null && gpsAccuracyM > 3000) return 'Approx. (imprecise GPS)';
    if (Number(km) > 15) return `~${Number(km).toFixed(1)} km (check GPS)`;
    return `${Number(km).toFixed(2)} km`;
  };

  const resetIntakeForm = () => {
    setFormData({ chief_complaint: '', severity: 'moderate', duration: '', functional_difficulty: '', additional_notes: '', _durationManual: false, _severityManual: false });
    setSemanticPreview(null);
    setDeptAvailability(null);
    setReferralResult(null);
    setErrorMsg(null);
    setVoiceResetKey((k) => k + 1);
  };

  const startAnotherConsult = () => {
    setActivePatientToken(null);
    setCallingAlert(null);
    setRxReadyAlert(null);
    resetIntakeForm();
    setVisitStep('hospital');
    setActiveTab('visit');
  };

  const fetchMyActiveToken = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get('/queue/patient/my-token');
      if (res.data && isLiveQueueToken(res.data)) {
        setActivePatientToken(res.data);
        setVisitStep('C');
      } else {
        // COMPLETED / none — free the consult flow for another visit
        setActivePatientToken(null);
        setVisitStep((s) => (s === 'C' ? 'hospital' : s));
      }
    } catch (e) {
      console.warn('Failed to load active patient token:', e);
    }
  };

  const fetchCheckinStatus = async () => {
    if (!isAuthenticated || user?.role !== 'patient') {
      setCheckinStatus(null);
      return;
    }
    try {
      const res = await api.get(`/patient/checkin/status?hospital_id=${VICTORIA_ID}`);
      setCheckinStatus(res.data);
    } catch {
      setCheckinStatus({ checked_in: false, message: 'Unable to verify check-in.' });
    }
  };

  const fetchMyConsultations = async () => {
    if (!isAuthenticated) return;
    setFetchingHistory(true);
    try {
      const res = await api.get('/patient/consultations/my');
      setConsultations(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingHistory(false);
    }
  };

  const fetchMyReviews = async () => {
    if (!isAuthenticated) {
      setMyReviews([]);
      return;
    }
    try {
      const res = await api.get('/reviews/my');
      setMyReviews(res.data?.reviews || []);
    } catch {
      setMyReviews([]);
    }
  };

  const fetchFollowUps = async () => {
    if (!isAuthenticated || user?.role !== 'patient') {
      setFollowUpDash({
        upcoming: [],
        past: [],
        due_reminders: [],
        total_upcoming: 0,
        total_past: 0,
        total_due_reminders: 0,
      });
      return;
    }
    setFollowUpLoading(true);
    try {
      const res = await api.get('/followups/my');
      setFollowUpDash(res.data || {
        upcoming: [],
        past: [],
        due_reminders: [],
        total_upcoming: 0,
        total_past: 0,
        total_due_reminders: 0,
      });
    } catch (err) {
      console.warn('Follow-ups load failed:', err);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const acknowledgeReminder = async (reminderId) => {
    try {
      await api.post('/followups/reminders/acknowledge', { reminder_id: reminderId });
      fetchFollowUps();
    } catch (err) {
      console.warn(err);
    }
  };

  useEffect(() => {
    fetchMyConsultations();
    fetchMyReviews();
    fetchMyActiveToken();
    fetchCheckinStatus();
    fetchFollowUps();
  }, [isAuthenticated]);

  // Keep patients-ahead live while waiting (poll + WS)
  useEffect(() => {
    if (!isAuthenticated || !activePatientToken) return undefined;
    const st = String(activePatientToken.status || '').toUpperCase();
    if (st !== 'WAITING' && st !== 'CALLED') return undefined;
    const tick = setInterval(() => {
      fetchMyActiveToken();
    }, 8000);
    return () => clearInterval(tick);
  }, [isAuthenticated, activePatientToken?.token_id, activePatientToken?.status]);

  useHospitalWebSocket((payload) => {
    const { event, data } = payload;
    const isMine = () =>
      (activePatientToken && (activePatientToken.token_id === data.token_id || activePatientToken.token_number === data.token_number)) ||
      (user && (user.id === data.patient_id || user.name === data.patient_name));

    const sameDeptQueueEvent = [
      'TOKEN_CALLED',
      'CONSULTATION_STARTED',
      'CONSULTATION_COMPLETED',
      'PRESCRIPTION_ISSUED',
      'PATIENT_SKIPPED',
      'TOKEN_REJOINED',
      'OPD_TOKEN_ISSUED',
    ].includes(event);

    // Any chamber progress in our department refreshes patients-ahead
    if (sameDeptQueueEvent) {
      const myDept = activePatientToken?.department;
      if (!myDept || !data?.department || String(data.department).toLowerCase().includes(String(myDept).toLowerCase().slice(0, 8)) || String(myDept).toLowerCase().includes(String(data.department).toLowerCase().slice(0, 8))) {
        fetchMyActiveToken();
      }
    }

    if (event === 'FOLLOW_UP_REMINDER' && user && data?.patient_id === user.id) {
      playHospitalChime('rx');
      fetchFollowUps();
      setActiveTab('followups');
    }

    if (event === 'PRESCRIPTION_ISSUED' && isMine()) {
      fetchFollowUps();
    }

    if (event === 'TOKEN_CALLED' && isMine()) {
      playHospitalChime('call');
      setCallingAlert(data);
      setActiveTab('home');
      setActivePatientToken((prev) => prev ? { ...prev, status: 'CALLED', patients_ahead: 0, queue_position: 1, assigned_room: data.room_number || prev.assigned_room, assigned_doctor_name: data.doctor_name || prev.assigned_doctor_name } : null);
    } else if (event === 'CONSULTATION_STARTED' && isMine()) {
      setCallingAlert(null);
      setActivePatientToken((prev) => prev ? { ...prev, status: 'IN_CONSULTATION', patients_ahead: 0, queue_position: 1 } : null);
    } else if (event === 'PATIENT_SKIPPED' && isMine()) {
      setActivePatientToken((prev) => prev ? { ...prev, status: 'SKIPPED' } : null);
    } else if (event === 'PRESCRIPTION_ISSUED' && isMine()) {
      playHospitalChime('prescription');
      setRxReadyAlert(data);
      setActiveTab('home');
      // Clear live token so a new consult can start (records keep the visit)
      setActivePatientToken(null);
      setVisitStep('hospital');
      fetchMyConsultations();
      if (data.prescription_id) {
        api.get(`/doctor-desk/prescriptions/${data.prescription_id}`)
          .then((res) => setViewingRx(res.data))
          .catch(() => {});
      }
    }
  });

  const handleReceptionCheckin = async (e) => {
    e?.preventDefault?.();
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }
    const clean = checkinCode.trim().toUpperCase();
    if (clean.length < 4) {
      setCheckinError('Enter the full code from the Victoria OPD desk.');
      return;
    }
    setCheckinLoading(true);
    setCheckinError(null);
    try {
      const res = await api.post('/patient/checkin', { code: clean, hospital_id: VICTORIA_ID });
      setCheckinStatus(res.data);
      setCheckinCode('');
      saveHospital({ hospital_id: VICTORIA_ID, name: VICTORIA_NAME, is_grid_pilot: true });
      setVisitStep(isLiveQueueToken(activePatientToken) ? 'C' : 'A');
    } catch (err) {
      setCheckinError(err.response?.data?.detail || err.message || 'Check-in failed.');
    } finally {
      setCheckinLoading(false);
    }
  };

  const runSemanticAnalysis = async (text, severity) => {
    if (!text || text.trim().length < 3) return null;
    setAnalyzingNlp(true);
    try {
      const res = await api.post('/nlp/semantic-extract', {
        text: text.trim(),
        reported_severity: severity || formData.severity,
      });
      const data = res.data?.data || null;
      setSemanticPreview(data);
      // Always refresh duration / limitation from the current prompt (clears stale autofill)
      setFormData((prev) => ({
        ...prev,
        duration: prev._durationManual ? prev.duration : (data?.duration || prev.duration || ''),
        functional_difficulty: data?.functional_difficulties?.[0] || prev.functional_difficulty || '',
      }));
      return data;
    } catch (err) {
      console.warn(err);
      return null;
    } finally {
      setAnalyzingNlp(false);
    }
  };

  const resetVisitAnalysis = () => {
    setSemanticPreview(null);
    setDeptAvailability(null);
    setReferralResult(null);
    setErrorMsg(null);
  };

  const handleVoiceTranscription = (transcribedText) => {
    setFormData((prev) => {
      const next = prev.chief_complaint ? `${prev.chief_complaint} ${transcribedText}` : transcribedText;
      return applyComplaintDerivedFields({ ...prev, _durationManual: false }, next);
    });
  };

  const handleVoiceClear = (clearedText) => {
    setFormData((prev) => {
      let updated = prev.chief_complaint;
      if (clearedText && updated.includes(clearedText)) updated = updated.replace(clearedText, '').trim();
      else if (updated === clearedText) updated = '';
      const next = applyComplaintDerivedFields(
        { ...prev, _durationManual: false, functional_difficulty: updated ? prev.functional_difficulty : '' },
        updated
      );
      return next;
    });
    setSemanticPreview(null);
  };

  const fetchDeptAvailability = async (department) => {
    if (!department) {
      setDeptAvailability(null);
      return null;
    }
    try {
      const params = new URLSearchParams({
        department,
        hospital_id: VICTORIA_ID,
      });
      if (userLocation?.lat != null && userLocation?.lon != null) {
        params.set('lat', String(userLocation.lat));
        params.set('lon', String(userLocation.lon));
      }
      const res = await api.get(`/hospitals/department-availability?${params.toString()}`);
      setDeptAvailability(res.data);
      return res.data;
    } catch (err) {
      console.warn('Department availability check failed:', err);
      setDeptAvailability(null);
      return null;
    }
  };

  const goToConfirmStep = async () => {
    if (!formData.chief_complaint.trim()) {
      setErrorMsg('Describe or speak your symptoms first.');
      return;
    }
    setErrorMsg(null);
    setReferralResult(null);
    setDeptAvailability(null);
    // Always re-analyse the current prompt — never reuse a previous department/referral
    const preview = await runSemanticAnalysis(formData.chief_complaint, formData.severity);
    if (!preview) {
      setErrorMsg('Could not analyse symptoms. Please try again.');
      return;
    }
    await fetchDeptAvailability(preview.recommended_department);
    setVisitStep('B');
  };

  const issueToken = async () => {
    if (!isVisitUnlocked) {
      setErrorMsg('Reception check-in required.');
      return;
    }
    if (deptAvailability && deptAvailability.can_issue_token === false) {
      setErrorMsg(deptAvailability.message || 'This department is not available at Victoria.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.post('/patient/consultation', {
        ...formData,
        hospital_id: VICTORIA_ID,
        hospital_name: VICTORIA_NAME,
      });
      if (res.data.extracted_entities) setSemanticPreview(res.data.extracted_entities);

      if (res.data.department_available === false || res.data.status === 'referred_external') {
        setReferralResult({
          message: res.data.availability_message,
          department: res.data.department,
          hospitals: res.data.recommended_hospitals || [],
        });
        setDeptAvailability({
          available: false,
          can_issue_token: false,
          canonical_department: res.data.department,
          message: res.data.availability_message,
          recommended_hospitals: res.data.recommended_hospitals || [],
        });
        setFormData({ chief_complaint: '', severity: 'moderate', duration: '', functional_difficulty: '', additional_notes: '', _durationManual: false, _severityManual: false });
        setVoiceResetKey((k) => k + 1);
        fetchMyConsultations();
        return;
      }

      if (res.data.token) {
        setActivePatientToken(res.data.token);
      } else if (res.data.token_number) {
        setActivePatientToken({
          token_id: res.data.token_id || res.data.id,
          token_number: res.data.token_number,
          department: res.data.department,
          assigned_room: res.data.assigned_room,
          assigned_doctor_name: res.data.assigned_doctor_name,
          queue_position: res.data.queue_position || 1,
          estimated_wait_minutes: res.data.estimated_wait_minutes || 10,
          status: 'WAITING',
          hospital_name: VICTORIA_NAME,
          created_at: res.data.created_at,
        });
      }
      setFormData({ chief_complaint: '', severity: 'moderate', duration: '', functional_difficulty: '', additional_notes: '', _durationManual: false, _severityManual: false });
      setVoiceResetKey((k) => k + 1);
      setVisitStep('C');
      fetchMyConsultations();
      fetchMyActiveToken();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to get token.');
    } finally {
      setLoading(false);
    }
  };

  const handleRejoinQueue = async (tokenId) => {
    if (!tokenId) return;
    setRejoiningQueue(true);
    try {
      const res = await api.post(`/queue/tokens/${tokenId}/rejoin`);
      setActivePatientToken(res.data);
    } catch {
      alert('Could not rejoin queue. Ask the OPD desk.');
    } finally {
      setRejoiningQueue(false);
    }
  };

  const handleViewPrescription = async (item) => {
    if (item.prescription && typeof item.prescription === 'object' && item.prescription.prescription_id) {
      setViewingRx(item.prescription);
      return;
    }
    try {
      let res;
      try {
        res = await api.get(`/patient/prescriptions/by-consultation/${item.id}`);
      } catch {
        res = await api.get(`/doctor-desk/prescriptions/by-consultation/${item.id}`);
      }
      if (res.data?.prescription) {
        setViewingRx(res.data.prescription);
        return;
      }
      if (item.prescription_id) {
        const byId = await api.get(`/doctor-desk/prescriptions/${item.prescription_id}`);
        setViewingRx(byId.data);
        return;
      }
      alert('Prescription is not ready yet.');
    } catch {
      alert('Could not load prescription.');
    }
  };

  const handleDownloadPrescription = async () => {
    if (!viewingRx) return;
    try {
      const ok = await downloadPrescriptionPdf(viewingRx);
      if (!ok) throw new Error('pdf failed');
    } catch {
      downloadPrescriptionFile(viewingRx);
      alert('PDF engine failed — HTML slip downloaded. Open it in Chrome/Edge → Print → Save as PDF.');
    }
  };

  const handleOpenPrescriptionTab = () => {
    if (!viewingRx) return;
    const ok = openPrescriptionInNewTab(viewingRx);
    if (!ok) {
      handleDownloadPrescription();
    }
  };

  const victoriaNearby = nearbyHospitalsList.find((h) => h.hospital_id === VICTORIA_ID || h.is_grid_pilot);
  const otherNearby = nearbyHospitalsList.filter((h) => h.hospital_id !== VICTORIA_ID && !h.is_grid_pilot);

  const requireAuth = (next) => {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }
    next();
  };

  /* ---------- HOME ---------- */
  const renderHome = () => (
    <div className="patient-panel">
      <h2>Home</h2>
      <p className="panel-lead">Your visit status for Victoria Hospital digital OPD.</p>

      {!isAuthenticated ? (
        <div className="patient-status-card idle">
          <strong style={{ display: 'block', marginBottom: 6 }}>Sign in to continue</strong>
          <p style={{ margin: '0 0 12px', fontSize: '0.88rem', color: '#64748b' }}>
            Use your mobile number to see queue status, check in at reception, and view records.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setAuthModalOpen(true)}>
            <LogIn size={14} /> Sign in / register
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserCheck size={22} />
              </div>
              <div>
                <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{user?.name}</strong>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  UHID: {user?.uhid || '—'}{user?.phone ? ` · ${user.phone}` : ''}
                </div>
              </div>
            </div>
            <button type="button" className="btn btn-outline" onClick={logout} style={{ fontSize: '0.8rem' }}>
              <LogOut size={13} /> Sign out
            </button>
          </div>

          {(followUpDash.due_reminders || []).length > 0 && (
            <div className="patient-status-card" style={{ background: '#fff7ed', border: '1px solid #fdba74', marginBottom: 12 }}>
              <strong style={{ display: 'block', marginBottom: 6, color: '#9a3412' }}>
                <Calendar size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Follow-up reminder{(followUpDash.due_reminders || []).length > 1 ? 's' : ''}
              </strong>
              {(followUpDash.due_reminders || []).slice(0, 2).map((r) => (
                <div key={r.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{r.title}</div>
                  <p style={{ margin: '4px 0 8px', fontSize: '0.82rem', color: '#9a3412', lineHeight: 1.4 }}>{r.message}</p>
                  <button type="button" className="btn btn-outline" style={{ fontSize: '0.76rem' }} onClick={() => acknowledgeReminder(r.id)}>
                    Got it
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-primary" style={{ fontSize: '0.78rem' }} onClick={() => setActiveTab('followups')}>
                Open follow-ups
              </button>
            </div>
          )}

          {callingAlert ? (
            <div className="patient-status-card calling">
              <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.9 }}>Doctor is calling</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, margin: '6px 0' }}>Token {callingAlert.token_number}</div>
              <div style={{ fontSize: '0.95rem' }}>
                Go to {callingAlert.room_number || activePatientToken?.assigned_room || 'your chamber'}
                {callingAlert.doctor_name ? ` · ${callingAlert.doctor_name}` : ''}
              </div>
              <button type="button" className="btn btn-outline" style={{ marginTop: 12, background: '#fff', color: '#7f1d1d' }} onClick={() => { setActiveTab('visit'); setVisitStep('C'); }}>
                Open Consult
              </button>
            </div>
          ) : rxReadyAlert ? (
            <div className="patient-status-card rx">
              <strong style={{ display: 'block', marginBottom: 4 }}>Visit completed · prescription ready</strong>
              <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: '#166534' }}>
                Token {rxReadyAlert.token_number} — slip saved under My records. You can start another consult anytime.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={() => {
                  if (rxReadyAlert.prescription_id) {
                    api.get(`/doctor-desk/prescriptions/${rxReadyAlert.prescription_id}`).then((r) => setViewingRx(r.data));
                  }
                }}>
                  <Pill size={14} /> View prescription
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setReviewFocusVisitId(rxReadyAlert?.consultation_id || null);
                    setActiveTab('reviews');
                  }}
                >
                  Review this visit
                </button>
                <button type="button" className="btn btn-outline" onClick={startAnotherConsult}>
                  Start another consult
                </button>
              </div>
            </div>
          ) : isLiveQueueToken(activePatientToken) ? (
            <div className="patient-status-card waiting">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>Token {activePatientToken.token_number}</strong>
                <span style={{ fontWeight: 800, color: '#1d4ed8' }}>{activePatientToken.status}</span>
              </div>
              {String(activePatientToken.status || '').toUpperCase() === 'WAITING' && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>Live queue</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                    {Number(activePatientToken.patients_ahead ?? Math.max(0, (activePatientToken.queue_position || 1) - 1))} ahead of you
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>
                    Position {activePatientToken.queue_position || '—'}
                    {activePatientToken.estimated_wait_minutes != null ? ` · ~${activePatientToken.estimated_wait_minutes} min` : ''}
                  </div>
                </div>
              )}
              {['CALLED', 'IN_CONSULTATION'].includes(String(activePatientToken.status || '').toUpperCase()) && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', fontWeight: 800, color: '#047857', fontSize: '0.88rem' }}>
                  You are next / with the doctor — 0 ahead
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: '0.88rem', color: '#334155', lineHeight: 1.5 }}>
                {activePatientToken.department} · {activePatientToken.assigned_room || 'Chamber TBA'}
                <br />
                {activePatientToken.assigned_doctor_name || 'Doctor assigning…'}
              </div>
              <button type="button" className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => { setActiveTab('visit'); setVisitStep('C'); }}>
                Track live visit
              </button>
            </div>
          ) : isVisitUnlocked ? (
            <div className="patient-status-card checked">
              <strong style={{ display: 'block', marginBottom: 4 }}>Checked in at Victoria</strong>
              <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: '#047857' }}>
                Today&apos;s visit is unlocked. Describe your symptoms to get an OPD token.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => { setActiveTab('visit'); setVisitStep(selectedHospital?.hospital_id === VICTORIA_ID ? 'A' : 'hospital'); }}>
                Continue consult <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="patient-status-card idle">
              <strong style={{ display: 'block', marginBottom: 4 }}>Ready for a consult?</strong>
              <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: '#64748b' }}>
                Open <strong>Consult</strong>, choose Victoria Hospital, enter the desk code, then describe symptoms — as many times as you need today.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={startAnotherConsult}>
                  Open Consult
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setActiveTab('nearby')}>
                  Nearby map only
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="patient-hub-grid" style={{ marginTop: 8 }}>
        <button type="button" className="patient-hub-card" onClick={() => requireAuth(() => setActiveTab('visit'))}>
          <Stethoscope size={20} color="#0284c7" />
          <div>
            <strong>Care</strong>
            <span>Consult · Ask AI · Follow-ups</span>
          </div>
        </button>
        <button type="button" className="patient-hub-card" onClick={() => setActiveTab('nearby')}>
          <MapPin size={20} color="#c2410c" />
          <div>
            <strong>Find</strong>
            <span>Nearby · Live OPD · Desk code</span>
          </div>
        </button>
        <button type="button" className="patient-hub-card" onClick={() => requireAuth(() => setActiveTab('records'))}>
          <FolderOpen size={20} color="#047857" />
          <div>
            <strong>Me</strong>
            <span>Records · Reviews</span>
          </div>
        </button>
      </div>
    </div>
  );

  /* ---------- NEARBY: live Google ratings, hours, contact, services + XAI ---------- */
  const renderNearbyHospitalCard = (h, { featured = false } = {}) => {
    const rating = Number(h.rating || 0);
    const reviews = Number(h.total_reviews || 0);
    const departments = h.departments || [];
    const strengths = h.xai_key_strengths || [];
    const directionsHref = userLocation
      ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lon}&destination=${h.latitude},${h.longitude}`
      : `https://www.google.com/maps/dir/?api=1&destination=${h.latitude},${h.longitude}`;

    return (
      <article
        key={h.hospital_id || h.name}
        className={`nearby-xai-card ${featured ? 'featured' : ''}`}
      >
        <div className="nearby-xai-top">
          <div>
            {featured && <div className="nearby-xai-eyebrow">Digital OPD · Grid pilot</div>}
            {!featured && h.category && <div className="nearby-xai-eyebrow">{h.category}</div>}
            <h3 className="nearby-xai-name">{h.name}</h3>
            <div className="nearby-xai-meta">
              {formatNearbyDistance(h.distance_km) || h.distance_label || ''}
              {h.estimated_travel_minutes ? ` · ~${h.estimated_travel_minutes} mins` : ''}
              {h.locality ? ` · ${h.locality}` : ''}
            </div>
          </div>
          <div className="nearby-xai-rating">
            <strong>{rating > 0 ? `${rating.toFixed(1)}★` : 'N/A'}</strong>
            <span>{reviews > 0 ? `${reviews.toLocaleString()} Google reviews` : 'No Google rating yet'}</span>
          </div>
        </div>

        {h.address && <p className="nearby-xai-address">{h.address}</p>}

        <div className="nearby-xai-facts">
          <div>
            <span className="nearby-fact-label">Timings</span>
            <strong>{h.opd_timings || 'OPD hours not published'}</strong>
          </div>
          <div>
            <span className="nearby-fact-label">Contact</span>
            <strong>
              {h.reception_phone || h.emergency_phone || '108'}
              {h.emergency_phone && h.reception_phone && h.emergency_phone !== h.reception_phone
                ? ` · Emergency ${h.emergency_phone}`
                : ''}
            </strong>
          </div>
          <div>
            <span className="nearby-fact-label">Source</span>
            <strong>{h.source === 'google_maps_live' ? 'Google Maps live' : (h.source || 'Hospital directory')}</strong>
          </div>
        </div>

        {departments.length > 0 && (
          <div className="nearby-xai-chip-row">
            <span className="nearby-fact-label">Services</span>
            <div className="nearby-chip-wrap">
              {departments.slice(0, 8).map((d) => (
                <span key={d} className="nearby-chip">{d}</span>
              ))}
            </div>
          </div>
        )}

        {(h.xai_review_summary || h.xai_ranking_rationale) && (
          <div className="nearby-xai-box">
            <div className="nearby-fact-label">XAI · Google review insight</div>
            {h.xai_review_summary && <p>{h.xai_review_summary}</p>}
            {h.xai_ranking_rationale && <p className="nearby-xai-rationale">{h.xai_ranking_rationale}</p>}
            {h.xai_patient_alerts && <p className="nearby-xai-alert">{h.xai_patient_alerts}</p>}
            {strengths.length > 0 && (
              <div className="nearby-chip-wrap" style={{ marginTop: 8 }}>
                {strengths.map((s) => (
                  <span key={s} className="nearby-chip strength">{s}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="nearby-xai-actions">
          <a href={directionsHref} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ fontSize: '0.78rem' }}>
            <ExternalLink size={13} /> Directions
          </a>
          {featured && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.78rem' }}
              onClick={() => { saveHospital(h); setActiveTab('visit'); setVisitStep('hospital'); }}
            >
              <Stethoscope size={14} /> Open Consult
            </button>
          )}
        </div>
      </article>
    );
  };

  const renderNearby = () => (
    <div className="patient-panel">
      <h2>Nearby hospitals</h2>
      <p className="panel-lead">
        Live GPS discovery with Google Maps ratings, review-based XAI, timings, contact, and services.
        Digital OPD intake starts under <strong>Consult</strong> (Victoria).
      </p>

      <button
        type="button"
        className="btn btn-primary"
        onClick={handleUseMyLocation}
        disabled={fetchingLocation}
        style={{ marginBottom: 14 }}
      >
        <Navigation size={14} />
        {fetchingLocation ? 'Detecting location…' : 'Use my location'}
      </button>

      {locationDenied && (
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: '0.88rem', color: '#9a3412' }}>
          Location is blocked. Allow GPS for this site and tap <strong>Use my location</strong> again.
        </div>
      )}
      {gpsHint && (
        <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: '0.86rem', color: '#1e40af' }}>
          {gpsHint}
          {gpsAccuracyM != null ? ` · reported accuracy ±${Math.round(gpsAccuracyM)} m` : ''}
        </div>
      )}

      {userLocation && (
        <div style={{ marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <iframe
            title="Nearby government hospitals map"
            width="100%"
            height="220"
            style={{ border: 0, display: 'block' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.google.com/maps?q=government+hospitals+near+${userLocation.lat},${userLocation.lon}&z=14&output=embed`}
          />
          <div style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#64748b', background: '#f8fafc' }}>
            Map centred on your position ({userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}) · list uses live Google Maps ratings where available
          </div>
        </div>
      )}

      {!userLocation && !locationDenied && (
        <p style={{ fontSize: '0.86rem', color: '#64748b' }}>Tap Use my location to load hospitals with ratings and XAI.</p>
      )}

      {victoriaNearby && (
        <>
          <h3 style={{ fontSize: '0.95rem', margin: '0 0 8px', color: '#0f172a' }}>Sushrutha Grid hospital</h3>
          {renderNearbyHospitalCard(victoriaNearby, { featured: true })}
        </>
      )}

      <h3 style={{ fontSize: '0.95rem', margin: '16px 0 8px', color: '#0f172a' }}>
        Other government hospitals near you
      </h3>
      {userLocation && otherNearby.length === 0 && (
        <p style={{ fontSize: '0.86rem', color: '#64748b' }}>No other government hospitals found in this radius.</p>
      )}
      {otherNearby.map((h) => renderNearbyHospitalCard(h))}
    </div>
  );

  /* ---------- CONSULT (choose hospital + visit flow) ---------- */
  const renderVisit = () => {
    if (!isAuthenticated) {
      return (
        <div className="patient-panel">
          <h2>Consult</h2>
          <p className="panel-lead">Sign in, choose Victoria Hospital, then enter the reception desk code.</p>
          <button type="button" className="btn btn-primary" onClick={() => setAuthModalOpen(true)}>
            <LogIn size={14} /> Sign in to continue
          </button>
        </div>
      );
    }

    const liveToken = isLiveQueueToken(activePatientToken);
    const effectiveStep = liveToken ? 'C' : visitStep;
    const victoriaSelected = selectedHospital?.hospital_id === VICTORIA_ID || selectedHospital?.is_grid_pilot;

    // Step: choose hospital (no govt seed dump — Victoria is the digital OPD; others stay on Nearby map)
    if (!liveToken && effectiveStep === 'hospital') {
      return (
        <div className="patient-panel">
          <h2>Consult</h2>
          <p className="panel-lead">Choose Victoria for digital OPD. Nearby tab shows live Google ratings, timings, contact, services, and XAI.</p>

          <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>Digital OPD live</div>
            <strong style={{ display: 'block', fontSize: '1.08rem', margin: '6px 0 4px', color: '#0f172a' }}>{VICTORIA_NAME}</strong>
            <p style={{ margin: '0 0 12px', fontSize: '0.84rem', color: '#475569', lineHeight: 1.45 }}>
              Reception desk code unlocks intake. You can consult again after a visit completes — no re-seeding needed. Distance belongs on the Nearby map tab (only when GPS is precise).
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                saveHospital(victoriaNearby || { hospital_id: VICTORIA_ID, name: VICTORIA_NAME, is_grid_pilot: true });
                setVisitStep(isVisitUnlocked ? 'A' : 'checkin');
              }}
            >
              <Building2 size={14} /> Select Victoria Hospital
            </button>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
            <strong style={{ display: 'block', color: '#0f172a', marginBottom: 4 }}>Other hospitals</strong>
            <p style={{ margin: '0 0 10px', fontSize: '0.84rem', color: '#64748b' }}>
              Map-only via live OpenStreetMap in Nearby — we are not seeding a separate government hospital database.
            </p>
            <button type="button" className="btn btn-outline" onClick={() => setActiveTab('nearby')}>
              <MapPin size={14} /> Open Nearby map
            </button>
          </div>

          {rxReadyAlert && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', fontSize: '0.86rem', color: '#166534' }}>
              Last visit completed (token {rxReadyAlert.token_number}). Select Victoria again to start a new consult, or open My records for the Rx.
            </div>
          )}
        </div>
      );
    }

    if (!liveToken && (effectiveStep === 'checkin' || (!isVisitUnlocked && victoriaSelected))) {
      return (
        <div className="patient-panel">
          <h2>Consult</h2>
          <p className="panel-lead">
            {VICTORIA_NAME} · enter today&apos;s reception desk code
          </p>
          <button type="button" className="btn btn-outline" style={{ marginBottom: 12, fontSize: '0.78rem' }} onClick={() => setVisitStep('hospital')}>
            ← Change hospital
          </button>
          <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <Lock size={20} color="#c2410c" />
              <strong>Reception check-in required</strong>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '0.84rem', color: '#9a3412', lineHeight: 1.45 }}>
              Live desk code is on the <strong>Desk code</strong> tab (or the{' '}
              <a href="/reception-display" target="_blank" rel="noreferrer" style={{ color: '#c2410c', fontWeight: 800 }}>
                reception desk display
              </a>
              ). Valid check-in usually lasts a few hours so you can do more than one consult.
            </p>
            <form onSubmit={handleReceptionCheckin} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 160 }}>
                <KeyRound size={16} color="#c2410c" />
                <input
                  value={checkinCode}
                  onChange={(e) => setCheckinCode(e.target.value.toUpperCase())}
                  placeholder="Desk code"
                  maxLength={8}
                  style={{ flex: 1, letterSpacing: '0.2em', fontWeight: 800, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #fdba74', textTransform: 'uppercase' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={checkinLoading}>
                {checkinLoading ? 'Checking…' : 'Unlock visit'}
              </button>
            </form>
            {checkinError && <p style={{ color: '#b91c1c', fontSize: '0.82rem', margin: '10px 0 0' }}>{checkinError}</p>}
          </div>
        </div>
      );
    }

    if (!isVisitUnlocked) {
      // Fall through guard — show check-in without setState during render
      return (
        <div className="patient-panel">
          <h2>Consult</h2>
          <p className="panel-lead">Reception check-in required before symptoms.</p>
          <button type="button" className="btn btn-primary" onClick={() => setVisitStep('checkin')}>
            Enter desk code
          </button>
        </div>
      );
    }

    return (
      <div className="patient-panel">
        <h2>Consult</h2>
        <p className="panel-lead">
          {VICTORIA_NAME}
          {checkinStatus?.valid_until ? ` · checked in until ${formatUtcTime(checkinStatus.valid_until)}` : ' · checked in'}
        </p>
        {!liveToken && (
          <button type="button" className="btn btn-outline" style={{ marginBottom: 12, fontSize: '0.78rem' }} onClick={() => setVisitStep('hospital')}>
            ← Change hospital
          </button>
        )}

        <div className="visit-step-pills">
          <span className={`visit-step-pill ${effectiveStep === 'hospital' || effectiveStep === 'checkin' ? 'on' : ''}`}>Hospital</span>
          <span className={`visit-step-pill ${effectiveStep === 'A' ? 'on' : ''}`}>Symptoms</span>
          <span className={`visit-step-pill ${effectiveStep === 'B' ? 'on' : ''}`}>Confirm</span>
          <span className={`visit-step-pill ${effectiveStep === 'C' ? 'on' : ''}`}>Live token</span>
        </div>

        {errorMsg && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        {effectiveStep === 'A' && (
          <div className="intake-form">
            <div className="intake-voice-slot">
              <VoiceRecorder key={voiceResetKey} onTranscriptionComplete={handleVoiceTranscription} onClearTranscription={handleVoiceClear} />
            </div>

            <label className="intake-label" htmlFor="chief_complaint">What is wrong?</label>
            <textarea
              id="chief_complaint"
              className="intake-textarea"
              value={formData.chief_complaint}
              onChange={(e) => {
                const value = e.target.value;
                setFormData((prev) => applyComplaintDerivedFields({ ...prev, _durationManual: false }, value));
                if (semanticPreview || deptAvailability || referralResult) resetVisitAnalysis();
              }}
              rows={4}
              placeholder="Speak or type your symptoms… e.g. knee pain since 3 days"
            />
            <p className="intake-hint">
              Department comes from your words. Severity only changes urgency. Mention days/weeks and duration fills as you type.
            </p>

            <div className="intake-field-block">
              <span className="intake-label">How bad is it?</span>
              <div className="severity-toggle" role="group" aria-label="Symptom severity">
                {[
                  { level: 'mild', hint: 'Can manage day-to-day' },
                  { level: 'moderate', hint: 'Hurting, need care soon' },
                  { level: 'severe', hint: 'Urgent / hard to function' },
                ].map(({ level, hint }) => (
                  <button
                    key={level}
                    type="button"
                    className={`severity-chip severity-${level} ${formData.severity === level ? 'active' : ''}`}
                    onClick={() => setFormData((prev) => ({ ...prev, severity: level, _severityManual: true }))}
                    title={hint}
                  >
                    <span className="severity-chip-dot" />
                    <span className="severity-chip-text">
                      <strong>{level}</strong>
                      <small>{hint}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="intake-field-block">
              <label className="intake-label" htmlFor="symptom_duration">
                How long?
                {formData.duration && !formData._durationManual && (
                  <span className="intake-autofill-tag">from your words</span>
                )}
              </label>
              <input
                id="symptom_duration"
                className={`intake-input ${formData.duration ? 'has-value' : ''}`}
                value={formData.duration}
                onChange={(e) => setFormData((prev) => ({
                  ...prev,
                  duration: e.target.value,
                  _durationManual: true,
                }))}
                placeholder="e.g. 3 days — auto-fills when you type “since 3 days”"
              />
            </div>

            <button
              type="button"
              className="btn btn-primary intake-continue"
              onClick={goToConfirmStep}
              disabled={analyzingNlp || !formData.chief_complaint.trim()}
            >
              {analyzingNlp ? 'Reading symptoms…' : 'Continue to confirm'} <ArrowRight size={16} />
            </button>
          </div>
        )}

        {effectiveStep === 'B' && semanticPreview && (
          <>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <strong><Stethoscope size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />{semanticPreview.recommended_department || 'General Medicine'}</strong>
                {(() => {
                  const pr = priorityLabel(semanticPreview.triage_urgency);
                  return <span style={{ background: pr.bg, color: pr.color, fontWeight: 800, padding: '4px 10px', borderRadius: 999, fontSize: '0.78rem' }}>{pr.text}</span>;
                })()}
              </div>
              <p style={{ margin: '0 0 8px', fontSize: '0.88rem', color: '#334155', fontStyle: 'italic' }}>
                &ldquo;{formData.chief_complaint || semanticPreview.text}&rdquo;
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.8rem', color: '#64748b', marginBottom: 12 }}>
                {formData.duration || semanticPreview.duration ? <span>Duration: <strong style={{ color: '#0f172a' }}>{formData.duration || semanticPreview.duration}</strong></span> : null}
                <span>Severity used: <strong style={{ color: '#0f172a' }}>{semanticPreview.severity || formData.severity}</strong></span>
              </div>

              {(semanticPreview.confirmed_symptoms || []).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase', marginBottom: 6 }}>Confirmed symptoms</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {semanticPreview.confirmed_symptoms.map((s, idx) => (
                      <span key={idx} style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '4px 8px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 }}>
                        {s.canonical_name}{s.anatomical_region ? ` · ${s.anatomical_region}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(semanticPreview.negated_symptoms || []).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', marginBottom: 6 }}>Ruled out (NegEx)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {semanticPreview.negated_symptoms.map((s, idx) => (
                      <span key={idx} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '4px 8px', borderRadius: 999, fontSize: '0.78rem', textDecoration: 'line-through' }}>
                        {s.canonical_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Always-visible Columbia / CDC routing evidence with match % */}
            <div style={{ background: '#f5f3ff', border: '1.5px solid #c4b5fd', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <strong style={{ color: '#5b21b6', fontSize: '0.92rem' }}>
                  Department routing · Columbia CUMC / CDC SymCat
                </strong>
                {semanticPreview.routing_xai?.top_match_score_pct != null && (
                  <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff', background: '#6d28d9', padding: '4px 12px', borderRadius: 999 }}>
                    {semanticPreview.routing_xai.top_match_score_pct}% top match
                  </span>
                )}
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '0.84rem', color: '#5b21b6', lineHeight: 1.45 }}>
                {semanticPreview.routing_xai?.summary
                  || `Routed to ${semanticPreview.recommended_department}.`}
              </p>

              {(semanticPreview.correlated_conditions || semanticPreview.routing_xai?.corpus_conditions_ranked || []).length > 0 ? (
                (semanticPreview.correlated_conditions || semanticPreview.routing_xai.corpus_conditions_ranked).slice(0, 4).map((cond, idx) => {
                  const pct = Number(cond.match_score_pct) || 0;
                  return (
                    <div key={idx} style={{ background: '#fff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <div>
                          <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block' }}>{cond.condition}</strong>
                          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            ICD-10 {cond.icd10 || '—'} · suggests {cond.department || semanticPreview.recommended_department}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#6d28d9', alignSelf: 'center' }}>
                          {pct}%
                        </span>
                      </div>
                      <div style={{ height: 8, background: '#ede9fe', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.max(4, pct))}%`, height: '100%', background: 'linear-gradient(90deg,#7c3aed,#4f46e5)', borderRadius: 999 }} />
                      </div>
                      {cond.supporting_symptoms?.length > 0 && (
                        <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: 6 }}>
                          Corroborated by: {cond.supporting_symptoms.join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ background: '#fff', border: '1px dashed #c4b5fd', borderRadius: 8, padding: 12, fontSize: '0.84rem', color: '#6b21a8' }}>
                  No ranked ontology condition crossed the match threshold for this wording. Department still came from confirmed symptoms / specialty narrative rules.
                  {semanticPreview.academic_citation?.knowledge_base ? (
                    <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#7c3aed' }}>{semanticPreview.academic_citation.knowledge_base}</div>
                  ) : null}
                </div>
              )}

              {semanticPreview.pcod_evaluation?.is_pcod_suspected && (
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: 10, fontSize: '0.84rem', color: '#6b21a8', marginTop: 4 }}>
                  <strong>PCOD / PCOS (Rotterdam 2003)</strong>
                  {' · '}{semanticPreview.pcod_evaluation.rotterdam_cluster_count} clusters
                  {' · '}<strong>{semanticPreview.pcod_evaluation.confidence_score}% confidence</strong>
                  {semanticPreview.pcod_evaluation.recommended_diagnostic_panel?.length
                    ? ` · tests: ${semanticPreview.pcod_evaluation.recommended_diagnostic_panel.map((t) => t.test_name).slice(0, 4).join(', ')}`
                    : ''}
                </div>
              )}

              {semanticPreview.academic_citation?.citeable_for_thesis && (
                <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#7c3aed' }}>
                  Grounded in {semanticPreview.academic_citation.knowledge_base}. NegEx: {semanticPreview.academic_citation.clinical_assertion_engine}.
                </div>
              )}
            </div>

            {deptAvailability && deptAvailability.can_issue_token === false && (
              <div style={{ background: '#fff7ed', border: '1.5px solid #fdba74', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <strong style={{ display: 'block', color: '#9a3412', marginBottom: 6 }}>
                  {deptAvailability.canonical_department || semanticPreview.recommended_department} is not on Victoria&apos;s live roster
                </strong>
                <p style={{ margin: '0 0 12px', fontSize: '0.86rem', color: '#9a3412', lineHeight: 1.45 }}>
                  {deptAvailability.message || referralResult?.message}
                </p>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                  Recommended centres
                </div>
                {(deptAvailability.recommended_hospitals || []).map((h, idx) => (
                  <div key={h.hospital_id || h.name || idx} style={{ padding: '10px 0', borderTop: idx ? '1px solid #fed7aa' : 'none', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ color: '#0f172a', display: 'block' }}>{h.name}</strong>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {h.reason}
                        {h.distance_km != null ? ` · ${Number(h.distance_km).toFixed(1)} km` : ''}
                        {h.address ? ` · ${h.address}` : ''}
                      </span>
                    </div>
                    {(h.latitude != null && h.longitude != null) && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${h.latitude},${h.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline"
                        style={{ fontSize: '0.75rem', textDecoration: 'none' }}
                      >
                        Directions
                      </a>
                    )}
                  </div>
                ))}
                {!(deptAvailability.recommended_hospitals || []).length && (
                  <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b' }}>Ask Victoria reception for a paper referral to the nearest specialty centre.</p>
                )}
              </div>
            )}

            {deptAvailability?.can_issue_token !== false && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: '0.86rem', color: '#065f46' }}>
                {deptAvailability?.canonical_department || semanticPreview.recommended_department} is available on Victoria&apos;s live roster. You can take a digital OPD token here.
              </div>
            )}

            {referralResult && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: '0.86rem', color: '#065f46' }}>
                Analysis saved. No Victoria digital token was issued because this specialty is not on the live roster here.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setVisitStep('A'); resetVisitAnalysis(); }}>
                Edit symptoms
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={analyzingNlp}
                onClick={async () => {
                  setReferralResult(null);
                  const preview = await runSemanticAnalysis(formData.chief_complaint, formData.severity);
                  if (preview) await fetchDeptAvailability(preview.recommended_department);
                }}
              >
                <RotateCw size={14} /> {analyzingNlp ? 'Re-analysing…' : 'Re-analyse'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setActiveTab('nearby')}>
                <MapPin size={14} /> Nearby hospitals
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setActiveTab('home')}>
                <Home size={14} /> Home
              </button>
              {deptAvailability?.can_issue_token === false ? (
                <button type="button" className="btn btn-primary" onClick={() => window.open('/reception-display', '_blank')}>
                  Ask reception / desk code
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={issueToken} disabled={loading || analyzingNlp}>
                  <Send size={14} /> {loading ? 'Issuing token…' : 'Get my token'}
                </button>
              )}
            </div>
          </>
        )}

        {effectiveStep === 'B' && !semanticPreview && (
          <button type="button" className="btn btn-outline" onClick={() => setVisitStep('A')}>Go back and add symptoms</button>
        )}

        {effectiveStep === 'C' && liveToken && (
          <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>Live OPD token</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', margin: '6px 0' }}>{activePatientToken.token_number}</div>
            {String(activePatientToken.status || '').toUpperCase() === 'WAITING' && (
              <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>Patients ahead of you</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
                  {Number(activePatientToken.patients_ahead ?? Math.max(0, (activePatientToken.queue_position || 1) - 1))}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 4 }}>
                  Updates live as the doctor completes consultations · Position {activePatientToken.queue_position || '—'}
                  {activePatientToken.estimated_wait_minutes != null ? ` · ~${activePatientToken.estimated_wait_minutes} min` : ''}
                </div>
              </div>
            )}
            {['CALLED', 'IN_CONSULTATION'].includes(String(activePatientToken.status || '').toUpperCase()) && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontWeight: 800, color: '#047857' }}>
                0 patients ahead — {String(activePatientToken.status).toUpperCase() === 'CALLED' ? 'please go to the chamber' : 'consultation in progress'}
              </div>
            )}
            <div style={{ fontSize: '0.92rem', color: '#334155', lineHeight: 1.55 }}>
              {VICTORIA_NAME}<br />
              {activePatientToken.department} · {activePatientToken.assigned_room || 'Chamber TBA'}<br />
              {activePatientToken.assigned_doctor_name || 'Doctor assigning…'}<br />
              Status: <strong>{activePatientToken.status}</strong>
            </div>
            {activePatientToken.status === 'SKIPPED' && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 14 }}
                disabled={rejoiningQueue}
                onClick={() => handleRejoinQueue(activePatientToken.token_id)}
              >
                <RotateCw size={14} /> {rejoiningQueue ? 'Rejoining…' : 'Re-join queue'}
              </button>
            )}
          </div>
        )}

        {effectiveStep === 'C' && !liveToken && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 16 }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>No live token right now</strong>
            <p style={{ margin: '0 0 12px', fontSize: '0.86rem', color: '#166534' }}>
              Previous visits stay in My records. Start another consult whenever you need.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={startAnotherConsult}>Start another consult</button>
              {rxReadyAlert?.prescription_id && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => api.get(`/doctor-desk/prescriptions/${rxReadyAlert.prescription_id}`).then((r) => setViewingRx(r.data))}
                >
                  <Pill size={14} /> View last Rx
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ---------- FOLLOW-UPS ---------- */
  const renderFollowUpCard = (a, { past = false } = {}) => (
    <article key={a.id} className={`fu-card ${past ? 'past' : 'upcoming'}`}>
      <div className="fu-card-top">
        <strong>{a.follow_up_on}</strong>
        <span className={`fu-status ${past ? 'missed' : 'live'}`}>
          {past ? (a.status === 'missed' ? 'Missed' : a.status) : a.status}
        </span>
      </div>
      <div className="fu-card-meta">
        {a.department || 'OPD'}
        {a.doctor_name ? ` · ${a.doctor_name}` : ''}
        {a.clinical_diagnosis ? ` · ${a.clinical_diagnosis}` : ''}
      </div>
      {a.prescription_id && <div className="fu-card-rx">{a.prescription_id}</div>}
      {a.follow_up_advice && <p className="fu-card-advice">{a.follow_up_advice}</p>}
      {!past && (a.reminders || []).length > 0 && (
        <div className="fu-card-reminders">
          {(a.reminders || []).map((r) => (
            <span key={r.id || `${r.reminder_type}-${r.status}`} className="fu-mini-chip">
              {String(r.reminder_type || '').replace('_', ' ')} · {r.status}
            </span>
          ))}
        </div>
      )}
      {past && (
        <p className="fu-card-note">Date passed — ask the desk if you still need a review.</p>
      )}
    </article>
  );

  const renderFollowUps = () => {
    const due = followUpDash.due_reminders || [];
    const upcoming = followUpDash.upcoming || [];
    const past = followUpDash.past || [];

    return (
      <div className="patient-panel">
        <div className="fu-page-head">
          <div>
            <h2>Follow-ups</h2>
            <p className="panel-lead">Reminders and review dates from each of your prescriptions.</p>
          </div>
          {isAuthenticated && (
            <button type="button" className="btn btn-outline" style={{ fontSize: '0.78rem' }} onClick={fetchFollowUps} disabled={followUpLoading}>
              <RotateCw size={13} /> Refresh
            </button>
          )}
        </div>

        {!isAuthenticated ? (
          <button type="button" className="btn btn-primary" onClick={() => setAuthModalOpen(true)}>
            <LogIn size={14} /> Sign in to see follow-ups
          </button>
        ) : (
          <div className="fu-stacks">
            {followUpLoading && <p className="fu-empty">Loading…</p>}

            <section className="fu-block due">
              <header className="fu-block-head">
                <span className="fu-block-title">Due now</span>
                <span className="fu-count">{due.length}</span>
              </header>
              {due.length === 0 ? (
                <p className="fu-empty">Nothing due today.</p>
              ) : (
                due.map((r) => (
                  <article key={r.id} className="fu-card due">
                    <div className="fu-card-top">
                      <strong>{r.title}</strong>
                      <span className="fu-status due-tag">{r.follow_up_on}</span>
                    </div>
                    <p className="fu-card-advice">{r.message}</p>
                    <button type="button" className="btn btn-primary" style={{ fontSize: '0.78rem', marginTop: 8 }} onClick={() => acknowledgeReminder(r.id)}>
                      Got it
                    </button>
                  </article>
                ))
              )}
            </section>

            <section className="fu-block upcoming">
              <header className="fu-block-head">
                <span className="fu-block-title">Upcoming</span>
                <span className="fu-count">{upcoming.length}</span>
              </header>
              {upcoming.length === 0 ? (
                <p className="fu-empty">No future follow-up dates yet.</p>
              ) : (
                upcoming.map((a) => renderFollowUpCard(a))
              )}
            </section>

            <section className="fu-block past">
              <header className="fu-block-head">
                <span className="fu-block-title">Past / missed</span>
                <span className="fu-count">{past.length}</span>
              </header>
              {past.length === 0 ? (
                <p className="fu-empty">No past follow-up dates for this account yet.</p>
              ) : (
                past.map((a) => renderFollowUpCard(a, { past: true }))
              )}
            </section>
          </div>
        )}
      </div>
    );
  };

  /* ---------- MY RECORDS ---------- */
  const renderRecords = () => (
    <div className="patient-panel">
      <h2>My records</h2>
      <p className="panel-lead">Past visits, prescriptions, and account details.</p>

      {!isAuthenticated ? (
        <button type="button" className="btn btn-primary" onClick={() => setAuthModalOpen(true)}>
          <LogIn size={14} /> Sign in to view records
        </button>
      ) : (
        <>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>Account</strong>
            <div style={{ fontSize: '0.86rem', color: '#475569', lineHeight: 1.55 }}>
              {user?.name}<br />
              Phone: {user?.phone || '—'} · Email: {user?.email || '—'}<br />
              UHID: {user?.uhid || '—'}
            </div>
            <button
              type="button"
              className="btn btn-outline"
              style={{ marginTop: 10, fontSize: '0.8rem' }}
              onClick={() => setAuthModalOpen(true)}
            >
              Forgot / change password
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong>Past visits</strong>
            <button type="button" className="btn btn-outline" style={{ fontSize: '0.78rem' }} onClick={fetchMyConsultations} disabled={fetchingHistory}>
              <RotateCw size={13} /> Refresh
            </button>
          </div>

          {fetchingHistory && <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Loading…</p>}
          {!fetchingHistory && consultations.length === 0 && (
            <p style={{ fontSize: '0.88rem', color: '#64748b' }}>No visits yet.</p>
          )}
          {consultations.map((item) => {
            const isCompleted = String(item.status || '').toLowerCase() === 'completed';
            const whenCreated = `${formatUtcDate(item.created_at)} · ${formatUtcTime(item.created_at)}`;
            const whenDone = item.completed_at
              ? `${formatUtcDate(item.completed_at)} · ${formatUtcTime(item.completed_at)}`
              : null;
            const hasRx = Boolean(item.prescription_id || item.prescription || isCompleted);
            const visitReview = myReviews.find((r) => r.consultation_id === item.id);
            const canReview = (isCompleted || hasRx) && !visitReview;
            return (
            <div key={item.id} className="record-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ color: '#0f172a' }}>{item.department || 'OPD'}</strong>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase',
                  padding: '3px 8px', borderRadius: 999,
                  background: isCompleted ? '#ecfdf5' : '#f1f5f9',
                  color: isCompleted ? '#047857' : '#64748b',
                }}>
                  {item.status}{isCompleted && whenDone ? ` · ${whenDone}` : ''}
                </span>
              </div>
              <div style={{ fontSize: '0.84rem', color: '#475569', marginTop: 6, lineHeight: 1.5 }}>
                Submitted: {whenCreated}<br />
                {whenDone ? <>Completed: {whenDone}<br /></> : null}
                {item.hospital_name || VICTORIA_NAME}
                {item.token_number ? ` · Token ${item.token_number}` : ''}
                {item.assigned_doctor_name ? ` · ${item.assigned_doctor_name}` : ''}
                {item.clinical_diagnosis ? <><br />Diagnosis: {item.clinical_diagnosis}</> : null}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: '0.78rem' }}
                  onClick={() => setExpandedRecordId(expandedRecordId === item.id ? null : item.id)}
                >
                  {expandedRecordId === item.id ? 'Hide details' : 'Open visit'}
                </button>
                {hasRx && (
                  <>
                    <button type="button" className="btn btn-primary" style={{ fontSize: '0.78rem' }} onClick={() => handleViewPrescription(item)}>
                      <Pill size={13} /> View prescription
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ fontSize: '0.78rem' }}
                      onClick={async () => {
                        await handleViewPrescription(item);
                      }}
                    >
                      <Printer size={13} /> Open to download
                    </button>
                  </>
                )}
                {canReview && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ fontSize: '0.78rem' }}
                    onClick={() => {
                      setReviewFocusVisitId(item.id);
                      setActiveTab('reviews');
                    }}
                  >
                    Write review
                  </button>
                )}
              </div>
              {expandedRecordId === item.id && (
                <div style={{ marginTop: 10, fontSize: '0.86rem', color: '#334155' }}>
                  <p style={{ margin: '0 0 8px' }}>&ldquo;{item.chief_complaint}&rdquo;</p>
                  {item.prescription_id && (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Rx ID: {item.prescription_id}</p>
                  )}
                </div>
              )}
              {visitReview && (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 10,
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  fontSize: '0.84rem',
                  color: '#9a3412',
                }}>
                  <strong style={{ display: 'block', marginBottom: 4, color: '#9a3412' }}>
                    Your review for this appointment
                  </strong>
                  <div style={{ color: '#7c2d12', lineHeight: 1.45 }}>
                    Hospital {visitReview.facility_rating || visitReview.hospital_rating}★
                    {' · '}Dept {visitReview.department_rating || '—'}★
                    {' · '}Doctor {visitReview.doctor_rating || '—'}★
                    {' · '}Ward {visitReview.ward_rating || '—'}★
                  </div>
                  <div style={{ marginTop: 4, color: '#9a3412' }}>
                    {visitReview.department}
                    {visitReview.doctor_name ? ` · ${visitReview.doctor_name}` : ''}
                    {visitReview.token_number ? ` · Token ${visitReview.token_number}` : ''}
                  </div>
                  {(visitReview.overall_comment || visitReview.comment) && (
                    <p style={{ margin: '6px 0 0', color: '#7c2d12' }}>
                      &ldquo;{visitReview.overall_comment || visitReview.comment}&rdquo;
                    </p>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </>
      )}
    </div>
  );

  return (
    <div className="patient-module">
      {(callingAlert || rxReadyAlert) && activeTab !== 'home' && (
        <div className={`patient-alert-banner ${callingAlert ? 'call' : 'rx'}`}>
          <div>
            <strong>{callingAlert ? `Calling token ${callingAlert.token_number}` : 'Prescription ready'}</strong>
            <div style={{ fontSize: '0.82rem', opacity: 0.9 }}>
              {callingAlert ? (callingAlert.room_number || 'Go to your chamber') : 'Open the slip from Home or My records'}
            </div>
          </div>
          <button type="button" className="btn btn-outline" style={{ background: '#fff' }} onClick={() => setActiveTab('home')}>
            Open Home
          </button>
        </div>
      )}

      <nav className="patient-tab-nav" aria-label="Patient main sections">
        {[
          { id: 'home', label: 'Home', icon: Home },
          { id: 'care', label: 'Care', icon: Stethoscope, needsAuth: true },
          { id: 'find', label: 'Find', icon: MapPin },
          { id: 'me', label: 'Me', icon: FolderOpen, needsAuth: true },
        ].map((tab) => {
          const Icon = tab.icon;
          const badge = tab.id === 'care' && (followUpDash.total_due_reminders || 0) > 0
            ? followUpDash.total_due_reminders
            : null;
          return (
            <button
              key={tab.id}
              type="button"
              className={`patient-tab-btn ${primaryNav === tab.id ? 'active' : ''}`}
              onClick={() => {
                if (tab.needsAuth && !isAuthenticated) {
                  setAuthModalOpen(true);
                }
                setPrimaryNav(tab.id);
                if (tab.id === 'care' && isAuthenticated) fetchFollowUps();
              }}
            >
              <Icon size={16} /> {tab.label}
              {badge != null && (
                <span className="patient-tab-badge">{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {primaryNav === 'care' && (
        <div className="patient-subnav" role="tablist" aria-label="Care">
          {[
            { id: 'visit', label: 'Consult', icon: Stethoscope },
            { id: 'assistant', label: 'Ask', icon: MessageCircle },
            { id: 'followups', label: 'Follow-ups', icon: Calendar },
          ].map((sub) => {
            const Icon = sub.icon;
            return (
              <button
                key={sub.id}
                type="button"
                role="tab"
                aria-selected={careSub === sub.id}
                className={`patient-subnav-btn ${careSub === sub.id ? 'active' : ''}`}
                onClick={() => {
                  if (!isAuthenticated) setAuthModalOpen(true);
                  setCareSub(sub.id);
                  if (sub.id === 'followups' && isAuthenticated) fetchFollowUps();
                }}
              >
                <Icon size={14} /> {sub.label}
                {sub.id === 'followups' && (followUpDash.total_due_reminders || 0) > 0 && (
                  <span className="patient-tab-badge">{followUpDash.total_due_reminders}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {primaryNav === 'find' && (
        <div className="patient-subnav" role="tablist" aria-label="Find">
          {[
            { id: 'nearby', label: 'Nearby', icon: MapPin },
            { id: 'liveopd', label: 'Live OPD', icon: Building2 },
            { id: 'desk', label: 'Desk code', icon: KeyRound },
          ].map((sub) => {
            const Icon = sub.icon;
            return (
              <button
                key={sub.id}
                type="button"
                role="tab"
                aria-selected={findSub === sub.id}
                className={`patient-subnav-btn ${findSub === sub.id ? 'active' : ''}`}
                onClick={() => setFindSub(sub.id)}
              >
                <Icon size={14} /> {sub.label}
              </button>
            );
          })}
        </div>
      )}

      {primaryNav === 'me' && (
        <div className="patient-subnav" role="tablist" aria-label="Me">
          {[
            { id: 'records', label: 'Records', icon: FolderOpen },
            { id: 'reviews', label: 'Reviews', icon: ClipboardList },
          ].map((sub) => {
            const Icon = sub.icon;
            return (
              <button
                key={sub.id}
                type="button"
                role="tab"
                aria-selected={meSub === sub.id}
                className={`patient-subnav-btn ${meSub === sub.id ? 'active' : ''}`}
                onClick={() => {
                  if (!isAuthenticated) setAuthModalOpen(true);
                  setMeSub(sub.id);
                }}
              >
                <Icon size={14} /> {sub.label}
              </button>
            );
          })}
        </div>
      )}

      {primaryNav === 'home' && renderHome()}

      {primaryNav === 'care' && careSub === 'visit' && renderVisit()}
      {primaryNav === 'care' && careSub === 'followups' && renderFollowUps()}
      {primaryNav === 'care' && careSub === 'assistant' && (
        isAuthenticated
          ? <PatientAssistantPanel />
          : (
            <div className="patient-panel">
              <h2>Ask about my visit</h2>
              <p className="panel-lead">Sign in as a patient to ask about your prescription and visit.</p>
              <button type="button" className="btn btn-primary" onClick={() => setAuthModalOpen(true)}>Sign in</button>
            </div>
          )
      )}

      {primaryNav === 'find' && findSub === 'nearby' && renderNearby()}
      {primaryNav === 'find' && findSub === 'liveopd' && (
        <div className="patient-panel">
          <h2>Live OPD queue</h2>
          <p className="panel-lead">Department-wise who&apos;s next at Victoria Hospital.</p>
          <LiveOpdWhosNextPanel compact />
        </div>
      )}
      {primaryNav === 'find' && findSub === 'desk' && (
        <div className="patient-panel">
          <h2>Reception desk code</h2>
          <p className="panel-lead">Enter this code under Care → Consult to unlock today&apos;s Victoria visit.</p>
          <ReceptionDeskCodePanel compact />
        </div>
      )}

      {primaryNav === 'me' && meSub === 'records' && renderRecords()}
      {primaryNav === 'me' && meSub === 'reviews' && (
        <PatientReviewPage
          isAuthenticated={isAuthenticated}
          onNeedAuth={() => setAuthModalOpen(true)}
          visits={consultations}
          myReviews={myReviews}
          preferredVisitId={reviewFocusVisitId || rxReadyAlert?.consultation_id || null}
          onReviewsChanged={async () => {
            await fetchMyReviews();
            setReviewFocusVisitId(null);
          }}
        />
      )}

      <UnifiedAuthModal
        isOpen={authModalOpen}
        initialRole="patient"
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          fetchMyConsultations();
          fetchMyActiveToken();
          fetchCheckinStatus();
          fetchFollowUps();
          setActiveTab('home');
        }}
      />

      {viewingRx && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 780, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
              <span style={{ fontSize: '0.84rem', color: '#16a34a', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} /> Digital prescription
              </span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={handleDownloadPrescription} className="btn btn-primary" style={{ fontSize: '0.82rem' }}>
                  <Printer size={15} /> Download PDF
                </button>
                <button type="button" onClick={handleOpenPrescriptionTab} className="btn btn-outline" style={{ fontSize: '0.82rem' }}>
                  Open in browser
                </button>
                <button type="button" onClick={() => setViewingRx(null)} className="btn btn-outline" style={{ fontSize: '0.82rem' }}>
                  <X size={14} /> Close
                </button>
              </div>
            </div>
            <div id="patient-printable-rx" style={{ border: '2px solid #0f172a', borderRadius: 8, padding: 24 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem' }}>SUSHRUTHA GRID · {viewingRx.prescription_id}</h2>
              <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#64748b' }}>
                {formatUtcDate(viewingRx.issued_at)} · {formatUtcTime(viewingRx.issued_at)}
              </p>
              <p style={{ fontSize: '0.9rem' }}>
                <strong>{viewingRx.patient_name}</strong> · Token {viewingRx.token_number}<br />
                Dr {viewingRx.doctor_name} · {viewingRx.department}
              </p>
              <h4 style={{ margin: '14px 0 6px' }}>{viewingRx.clinical_diagnosis} {viewingRx.icd10_code ? `(${viewingRx.icd10_code})` : ''}</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginTop: 10 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                    <th style={{ padding: 6 }}>Medicine</th>
                    <th style={{ padding: 6 }}>Dosage</th>
                    <th style={{ padding: 6 }}>Frequency</th>
                    <th style={{ padding: 6 }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingRx.medications || []).map((m, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 6, fontWeight: 700 }}>{m.medicine_name}</td>
                      <td style={{ padding: 6 }}>{m.dosage}</td>
                      <td style={{ padding: 6 }}>{m.frequency}</td>
                      <td style={{ padding: 6 }}>{m.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {viewingRx.follow_up_date && (
                <p style={{ marginTop: 12, fontSize: '0.85rem' }}><strong>Follow-up:</strong> {viewingRx.follow_up_date}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
