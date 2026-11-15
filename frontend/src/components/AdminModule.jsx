import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, ShieldAlert, KeyRound, UserPlus, Edit, Trash2, 
  Search, Filter, RefreshCw, Stethoscope, Building, Users, 
  Calendar, Clock, Phone, Mail, Award, Briefcase, CheckCircle2, 
  AlertCircle, LogOut, BarChart3, Bed, Activity, Lock, X, Plus, 
  HeartHandshake, Gift, Check, FileText, PhoneCall, Play, CheckCheck, UserX,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useHospitalWebSocket } from '../services/useHospitalWebSocket';
import UnifiedAuthModal from './UnifiedAuthModal';
import api from '../services/api';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend, Cell,
} from 'recharts';
import './AdminModule.css';

const OPERATIONAL_HOSPITAL_ID = 'HOSP-BLR-001';

const DEPARTMENTS = [
  'General Medicine', 'Cardiology', 'Orthopedics', 'Pulmonology',
  'Neurology', 'Gastroenterology', 'Urology', 'ENT',
  'Ophthalmology', 'Dermatology', 'Obstetrics & Gynecology', 'Endocrinology'
];

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_DOCTOR_FORM = {
  name: '',
  department: 'General Medicine',
  tier: 'JUNIOR_DOCTOR',
  employment_type: 'PERMANENT',
  designation: 'Junior Resident',
  qualification: 'MBBS',
  experience_years: 2,
  room_number: 'OPD Desk 101',
  shift: 'Morning (09:00 - 14:00)',
  opd_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  email: '',
  phone: '+91-',
  max_active_patients: 15,
  status: 'AVAILABLE'
};

const DEFAULT_VOL_FORM = {
  title: '',
  department: 'Main OPD Lobby',
  number_of_volunteers: 4,
  duration_per_day: '4 Hours / Day (Morning Shift)',
  total_days: 14,
  description: ''
};

const DEFAULT_CSR_ITEM = {
  item_name: '',
  quantity: 1,
  estimated_cost: ''
};

const formatUtcDateTime = (dateStr) => {
  if (!dateStr) return '—';
  const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  const d = new Date(utcStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
};

const formatUtcDate = (dateStr) => {
  if (!dateStr) return '—';
  const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  const d = new Date(utcStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
};

export default function AdminModule() {
  const { user, isAuthenticated, logout } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Admin section sub-navigation: 'reception' | 'doctors' | 'volunteers' | 'csr' | 'queues' | 'beds' | 'analytics' | 'audit'
  const [activeAdminTab, setActiveAdminTab] = useState('reception');

  // Reception desk code (Victoria check-in)
  const [receptionCode, setReceptionCode] = useState(null);
  const [receptionLoading, setReceptionLoading] = useState(false);
  const [receptionCountdown, setReceptionCountdown] = useState(0);

  // Global alerts
  const [alertMsg, setAlertMsg] = useState(null);
  const [alertType, setAlertType] = useState('success');

  // ==========================================
  // 1. DOCTORS ROSTER STATE
  // ==========================================
  const [doctors, setDoctors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterEmployment, setFilterEmployment] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedDoctorId, setSelectedDoctorId] = useState(null);
  const [doctorForm, setDoctorForm] = useState(DEFAULT_DOCTOR_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // ==========================================
  // 2. VOLUNTEER & NGO STATE
  // ==========================================
  const [volunteerSubTab, setVolunteerSubTab] = useState('request'); // 'request' | 'check_requests'
  const [volunteerRequisitions, setVolunteerRequisitions] = useState([]);
  const [volunteerApplications, setVolunteerApplications] = useState([]);
  const [loadingVolunteers, setLoadingVolunteers] = useState(false);
  const [volModalOpen, setVolModalOpen] = useState(false);
  const [volForm, setVolForm] = useState(DEFAULT_VOL_FORM);
  const [volSubmitting, setVolSubmitting] = useState(false);

  // ==========================================
  // 3. CSR REQUIREMENTS STATE
  // ==========================================
  const [csrRequirements, setCsrRequirements] = useState([]);
  const [loadingCsr, setLoadingCsr] = useState(false);
  const [csrModalOpen, setCsrModalOpen] = useState(false);
  const [csrForm, setCsrForm] = useState({
    title: '',
    department: 'Pediatrics & NICU',
    description: '',
    priority: 'CRITICAL',
    items: [{ ...DEFAULT_CSR_ITEM }]
  });
  const [csrSubmitting, setCsrSubmitting] = useState(false);

  // CSR Pledge Modal
  const [pledgeModalOpen, setPledgeModalOpen] = useState(false);
  const [pledgeTargetReq, setPledgeTargetReq] = useState(null);
  const [pledgeForm, setPledgeForm] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    pledged_amount: '',
    notes: ''
  });
  const [pledgeSubmitting, setPledgeSubmitting] = useState(false);

  // OPD Token Analytics & Monitoring State
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [reviewAnalytics, setReviewAnalytics] = useState(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [timeframeFilter, setTimeframeFilter] = useState('today'); // 'today', 'date', 'month', 'all'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [analyticsDeptFilter, setAnalyticsDeptFilter] = useState('ALL');

  // Live beds / hospital analytics / audit (Phase 2 — no fake UI data)
  const [bedData, setBedData] = useState(null);
  const [loadingBeds, setLoadingBeds] = useState(false);
  const [hospitalInsights, setHospitalInsights] = useState(null);
  const [loadingHospitalInsights, setLoadingHospitalInsights] = useState(false);
  const [auditData, setAuditData] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditEventFilter, setAuditEventFilter] = useState('ALL');

  const isAdmin = isAuthenticated && user?.role === 'admin';

  const showAlert = (msg, type = 'success') => {
    setAlertMsg(msg);
    setAlertType(type);
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // Load Doctors
  const fetchDoctorsAndSummary = async () => {
    setLoadingDoctors(true);
    try {
      const params = { hospital_id: OPERATIONAL_HOSPITAL_ID };
      if (filterDept) params.department = filterDept;
      if (filterTier) params.tier = filterTier;
      if (filterEmployment) params.employment_type = filterEmployment;
      if (filterStatus) params.status = filterStatus;
      if (searchTerm) params.search = searchTerm;

      const [docsRes, sumRes] = await Promise.all([
        api.get('/doctors/', { params }),
        api.get('/doctors/summary', { params: { hospital_id: OPERATIONAL_HOSPITAL_ID } })
      ]);

      setDoctors(docsRes.data.data || []);
      setSummary(sumRes.data.hospital_totals || null);
    } catch (err) {
      console.error('Failed to load doctors:', err);
      showAlert('Failed to load doctors roster.', 'error');
    } finally {
      setLoadingDoctors(false);
    }
  };

  // Load Volunteers
  const fetchVolunteerData = async () => {
    setLoadingVolunteers(true);
    try {
      const [reqsRes, appsRes] = await Promise.all([
        api.get('/admin/volunteers/requisitions'),
        api.get('/admin/volunteers/applications')
      ]);
      setVolunteerRequisitions(reqsRes.data.data || []);
      setVolunteerApplications(appsRes.data.data || []);
    } catch (err) {
      console.error('Failed to load volunteer data:', err);
    } finally {
      setLoadingVolunteers(false);
    }
  };

  // Load CSR
  const fetchCsrData = async () => {
    setLoadingCsr(true);
    try {
      const res = await api.get('/admin/csr/requirements');
      setCsrRequirements(res.data.data || []);
    } catch (err) {
      console.error('Failed to load CSR requirements:', err);
    } finally {
      setLoadingCsr(false);
    }
  };

  const fetchReviewAnalytics = async () => {
    setLoadingReviews(true);
    try {
      const res = await api.get(`/reviews/analytics?hospital_id=${OPERATIONAL_HOSPITAL_ID}`);
      setReviewAnalytics(res.data);
    } catch (err) {
      console.warn('Review analytics failed', err);
      // Keep prior data on transient/auth blips; only clear when we never loaded
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        showAlert('Admin session required to load Ratings analysis. Sign in again as hospital admin.', 'error');
      } else {
        showAlert(err.response?.data?.detail || 'Failed to load ratings analysis.', 'error');
      }
    } finally {
      setLoadingReviews(false);
    }
  };

  const fetchBedInventory = async () => {
    setLoadingBeds(true);
    try {
      const res = await api.get('/admin/beds', { params: { hospital_id: OPERATIONAL_HOSPITAL_ID } });
      setBedData(res.data?.data || null);
    } catch (err) {
      setBedData(null);
      showAlert(err.response?.data?.detail || 'Failed to load bed inventory.', 'error');
    } finally {
      setLoadingBeds(false);
    }
  };

  const updateWardOccupancy = async (wardId, occupied, total) => {
    try {
      await api.patch(`/admin/beds/${wardId}`, {
        occupied_beds: Number(occupied),
        total_beds: Number(total),
      }, { params: { hospital_id: OPERATIONAL_HOSPITAL_ID } });
      showAlert(`Updated ${wardId} occupancy.`);
      fetchBedInventory();
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Could not update ward beds.', 'error');
    }
  };

  const fetchHospitalInsights = async () => {
    setLoadingHospitalInsights(true);
    try {
      const res = await api.get('/admin/hospital-analytics', {
        params: { hospital_id: OPERATIONAL_HOSPITAL_ID },
      });
      setHospitalInsights(res.data?.data || null);
    } catch (err) {
      setHospitalInsights(null);
      showAlert(err.response?.data?.detail || 'Failed to load hospital analytics.', 'error');
    } finally {
      setLoadingHospitalInsights(false);
    }
  };

  const fetchAuditLogs = async (eventType = auditEventFilter) => {
    setLoadingAudit(true);
    try {
      const params = { hospital_id: OPERATIONAL_HOSPITAL_ID, limit: 100 };
      if (eventType && eventType !== 'ALL') params.event_type = eventType;
      const res = await api.get('/admin/audit-logs', { params });
      setAuditData(res.data?.data || null);
    } catch (err) {
      setAuditData(null);
      showAlert(err.response?.data?.detail || 'Failed to load audit logs.', 'error');
    } finally {
      setLoadingAudit(false);
    }
  };

  // Load OPD Token Analytics & Monitoring
  const fetchTokenAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const params = {
        hospital_id: OPERATIONAL_HOSPITAL_ID,
        timeframe: timeframeFilter,
        department: analyticsDeptFilter
      };
      if (timeframeFilter === 'date') params.target_date = selectedDate;
      if (timeframeFilter === 'month') params.target_month = selectedMonth;

      const res = await api.get('/queue/analytics', { params });
      setAnalyticsData(res.data);
    } catch (err) {
      console.error('Failed to load token analytics:', err);
      showAlert('Failed to refresh token analytics.', 'error');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Real-time WebSocket synchronization for Admin Command Center (Victoria Hospital HOSP-BLR-001)
  useHospitalWebSocket((payload) => {
    if (!isAdmin) return;
    if (payload.data?.hospital_id && payload.data.hospital_id !== OPERATIONAL_HOSPITAL_ID) {
      return;
    }
    const ev = payload.event;
    if (
      ev === 'TOKEN_ISSUED' ||
      ev === 'TOKEN_CALLED' ||
      ev === 'CONSULTATION_STARTED' ||
      ev === 'CONSULTATION_COMPLETED' ||
      ev === 'PATIENT_SKIPPED' ||
      ev === 'TOKEN_REJOINED' ||
      ev === 'PRESCRIPTION_ISSUED' ||
      ev === 'PATIENT_REVIEW_SUBMITTED' ||
      ev === 'DOCTOR_STATUS_UPDATED' ||
      ev === 'DOCTOR_ROSTER_UPDATED' ||
      ev === 'VOLUNTEER_REQUISITION_POSTED' ||
      ev === 'VOLUNTEER_APPLICATION_SUBMITTED' ||
      ev === 'CSR_REQUIREMENT_POSTED' ||
      ev === 'CSR_PLEDGE_RECORDED'
    ) {
      if (activeAdminTab === 'doctors') {
        fetchDoctorsAndSummary();
      } else if (activeAdminTab === 'queues') {
        fetchTokenAnalytics();
      } else if (activeAdminTab === 'reviews') {
        fetchReviewAnalytics();
      } else if (activeAdminTab === 'volunteers') {
        fetchVolunteerData();
      } else if (activeAdminTab === 'csr') {
        fetchCsrData();
      } else if (activeAdminTab === 'beds') {
        fetchBedInventory();
      } else if (activeAdminTab === 'analytics') {
        fetchHospitalInsights();
      } else if (activeAdminTab === 'audit') {
        fetchAuditLogs();
      }
    }
  });

  const fetchReceptionCode = async () => {
    setReceptionLoading(true);
    try {
      const res = await api.get('/reception/code/current');
      setReceptionCode(res.data);
      setReceptionCountdown(res.data.expires_in_seconds || 0);
    } catch (err) {
      console.error('Failed to load reception code:', err);
      showAlert(err.response?.data?.detail || 'Failed to load reception desk code.', 'error');
    } finally {
      setReceptionLoading(false);
    }
  };

  const handleGenerateReceptionCode = async () => {
    setReceptionLoading(true);
    try {
      const res = await api.post('/reception/code/generate');
      setReceptionCode(res.data);
      setReceptionCountdown(res.data.expires_in_seconds || 0);
      showAlert(`New desk code issued: ${res.data.code}`, 'success');
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Failed to generate desk code.', 'error');
    } finally {
      setReceptionLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      if (activeAdminTab === 'reception') {
        fetchReceptionCode();
      } else if (activeAdminTab === 'doctors') {
        fetchDoctorsAndSummary();
      } else if (activeAdminTab === 'volunteers') {
        fetchVolunteerData();
      } else if (activeAdminTab === 'csr') {
        fetchCsrData();
      } else if (activeAdminTab === 'queues') {
        fetchTokenAnalytics();
      } else if (activeAdminTab === 'reviews') {
        fetchReviewAnalytics();
      } else if (activeAdminTab === 'beds') {
        fetchBedInventory();
      } else if (activeAdminTab === 'analytics') {
        fetchHospitalInsights();
      } else if (activeAdminTab === 'audit') {
        fetchAuditLogs();
      }
    }
  }, [isAdmin, activeAdminTab, filterDept, filterTier, filterEmployment, filterStatus, searchTerm, timeframeFilter, selectedDate, selectedMonth, analyticsDeptFilter]);

  // Live countdown + soft refresh for reception desk board
  useEffect(() => {
    if (!isAdmin || activeAdminTab !== 'reception') return undefined;
    const tick = setInterval(() => {
      setReceptionCountdown((prev) => {
        if (prev <= 1) {
          fetchReceptionCode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [isAdmin, activeAdminTab]);

  // ==========================================
  // DOCTOR HANDLERS
  // ==========================================
  const handleOpenCreateDoctor = () => {
    setDoctorForm(DEFAULT_DOCTOR_FORM);
    setModalMode('create');
    setSelectedDoctorId(null);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEditDoctor = (doc) => {
    setDoctorForm({
      name: doc.name || '',
      department: doc.department || 'General Medicine',
      tier: doc.tier || 'JUNIOR_DOCTOR',
      employment_type: doc.employment_type || 'PERMANENT',
      designation: doc.designation || '',
      qualification: doc.qualification || '',
      experience_years: doc.experience_years ?? 1,
      room_number: doc.room_number || '',
      shift: doc.shift || 'Morning (09:00 - 14:00)',
      opd_days: doc.opd_days || ALL_DAYS,
      email: doc.email || '',
      phone: doc.phone || '+91-',
      max_active_patients: doc.max_active_patients || 15,
      status: doc.status || 'AVAILABLE'
    });
    setModalMode('edit');
    setSelectedDoctorId(doc.doctor_id);
    setFormError(null);
    setModalOpen(true);
  };

  const handleDayToggle = (day) => {
    setDoctorForm((prev) => {
      const exists = prev.opd_days.includes(day);
      const updated = exists ? prev.opd_days.filter((d) => d !== day) : [...prev.opd_days, day];
      return { ...prev, opd_days: updated };
    });
  };

  const handleDoctorFormSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    try {
      if (modalMode === 'create') {
        const res = await api.post('/doctors/', doctorForm);
        showAlert(`Doctor ${res.data.data.name} (${res.data.data.doctor_id}) registered successfully!`);
      } else {
        await api.put(`/doctors/${selectedDoctorId}`, doctorForm);
        showAlert(`Doctor profile ${selectedDoctorId} updated successfully!`);
      }
      setModalOpen(false);
      fetchDoctorsAndSummary();
    } catch (err) {
      setFormError(err.response?.data?.detail || err.message || 'Operation failed.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleStatusChange = async (doctorId, newStatus) => {
    try {
      await api.patch(`/doctors/${doctorId}/status`, { status: newStatus });
      setDoctors((prev) =>
        prev.map((d) => (d.doctor_id === doctorId ? { ...d, status: newStatus } : d))
      );
      showAlert(`Doctor ${doctorId} status updated to ${newStatus}.`);
    } catch (err) {
      showAlert(`Failed to update status for ${doctorId}`, 'error');
    }
  };

  const handleDeleteDoctor = async (doctorId, doctorName) => {
    if (!window.confirm(`Are you sure you want to remove ${doctorName} (${doctorId}) from the hospital roster?`)) {
      return;
    }
    try {
      await api.delete(`/doctors/${doctorId}`);
      showAlert(`Doctor ${doctorName} (${doctorId}) removed from roster.`);
      fetchDoctorsAndSummary();
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Failed to delete doctor profile.', 'error');
    }
  };

  // ==========================================
  // VOLUNTEER HANDLERS
  // ==========================================
  const handleCreateRequisitionSubmit = async (e) => {
    e.preventDefault();
    setVolSubmitting(true);
    try {
      const res = await api.post('/admin/volunteers/requisitions', volForm);
      showAlert(`Volunteer requirement '${res.data.data.requisition_id}' posted!`);
      setVolModalOpen(false);
      setVolForm(DEFAULT_VOL_FORM);
      fetchVolunteerData();
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Failed to post volunteer requirement.', 'error');
    } finally {
      setVolSubmitting(false);
    }
  };

  const handleDeleteRequisition = async (reqId) => {
    if (!window.confirm(`Cancel volunteer requisition ${reqId}?`)) return;
    try {
      await api.delete(`/admin/volunteers/requisitions/${reqId}`);
      showAlert(`Requisition ${reqId} canceled.`);
      fetchVolunteerData();
    } catch (err) {
      showAlert('Failed to delete requisition.', 'error');
    }
  };

  // ==========================================
  // CSR REQUIREMENTS HANDLERS
  // ==========================================
  const handleAddCsrItemRow = () => {
    setCsrForm((prev) => ({
      ...prev,
      items: [...prev.items, { ...DEFAULT_CSR_ITEM }]
    }));
  };

  const handleRemoveCsrItemRow = (index) => {
    setCsrForm((prev) => {
      if (prev.items.length <= 1) return prev;
      return {
        ...prev,
        items: prev.items.filter((_, i) => i !== index)
      };
    });
  };

  const handleCsrItemChange = (index, field, value) => {
    setCsrForm((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, items: updated };
    });
  };

  const handleCreateCsrSubmit = async (e) => {
    e.preventDefault();
    setCsrSubmitting(true);

    // Validate and format item numerical costs
    const cleanedItems = csrForm.items.map((it) => ({
      item_name: it.item_name.trim(),
      quantity: parseInt(it.quantity, 10) || 1,
      estimated_cost: parseFloat(it.estimated_cost) || 0
    }));

    if (cleanedItems.some((it) => !it.item_name || it.estimated_cost <= 0)) {
      showAlert('Please provide valid item names and estimated costs.', 'error');
      setCsrSubmitting(false);
      return;
    }

    try {
      const payload = {
        title: csrForm.title,
        department: csrForm.department,
        description: csrForm.description,
        priority: csrForm.priority,
        items: cleanedItems
      };

      const res = await api.post('/admin/csr/requirements', payload);
      showAlert(`Hospital requirement list '${res.data.data.requirement_id}' posted for CSR sponsorship!`);
      setCsrModalOpen(false);
      setCsrForm({
        title: '',
        department: 'Pediatrics & NICU',
        description: '',
        priority: 'CRITICAL',
        items: [{ ...DEFAULT_CSR_ITEM }]
      });
      fetchCsrData();
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Failed to post CSR requirement.', 'error');
    } finally {
      setCsrSubmitting(false);
    }
  };

  const handleDeleteCsrRequirement = async (reqId) => {
    if (!window.confirm(`Delete requirement list ${reqId}?`)) return;
    try {
      await api.delete(`/admin/csr/requirements/${reqId}`);
      showAlert(`Requirement list ${reqId} deleted.`);
      fetchCsrData();
    } catch (err) {
      showAlert('Failed to delete requirement.', 'error');
    }
  };

  const handleOpenPledgeModal = (req) => {
    setPledgeTargetReq(req);
    setPledgeForm({
      company_name: '',
      contact_person: '',
      email: '',
      pledged_amount: req.total_estimated_cost || '',
      notes: ''
    });
    setPledgeModalOpen(true);
  };

  const handlePledgeSubmit = async (e) => {
    e.preventDefault();
    setPledgeSubmitting(true);
    try {
      const payload = {
        company_name: pledgeForm.company_name,
        contact_person: pledgeForm.contact_person,
        email: pledgeForm.email,
        pledged_amount: parseFloat(pledgeForm.pledged_amount) || pledgeTargetReq.total_estimated_cost,
        notes: pledgeForm.notes
      };
      await api.post(`/admin/csr/requirements/${pledgeTargetReq.requirement_id}/pledge`, payload);
      showAlert(`CSR pledge recorded for ${pledgeTargetReq.requirement_id}! Status is now CSR_PLEDGED.`);
      setPledgeModalOpen(false);
      fetchCsrData();
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Failed to record CSR pledge.', 'error');
    } finally {
      setPledgeSubmitting(false);
    }
  };

  const handleFulfillRequirement = async (reqId) => {
    if (!window.confirm(`Confirm receipt and commissioning of items for ${reqId}?`)) return;
    try {
      await api.post(`/admin/csr/requirements/${reqId}/fulfill`);
      showAlert(`Requirement ${reqId} marked as FULFILLED! Items received.`);
      fetchCsrData();
    } catch (err) {
      showAlert(err.response?.data?.detail || 'Failed to mark requirement fulfilled.', 'error');
    }
  };

  // ====================================================
  // RENDER: LOGIN GATE IF NOT ADMIN
  // ====================================================
  if (!isAdmin) {
    return (
      <div className="admin-login-gate admin-gate">
        <div className="admin-gate-header">
          <div className="gate-badge-icon">
            <Lock size={28} />
          </div>
          <h3>Admin Command Center</h3>
          <p>Medical Superintendent &amp; hospital operations console.</p>
        </div>

        {isAuthenticated && user?.role !== 'admin' ? (
          <div className="switch-account-panel">
            <div className="status-alert alert-error" style={{ marginBottom: 14 }}>
              <ShieldAlert size={16} />
              <span>Signed in as <strong>{user.name} ({user.role})</strong>. Sign out to open Admin.</span>
            </div>
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => logout(true)}>
              Sign out &amp; switch
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', textAlign: 'center', lineHeight: 1.5 }}>
              Use the shared hospital sign-in. Admin tab opens automatically — you can also switch to Patient or Doctor.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: 12, fontWeight: 800 }}
              onClick={() => setAuthModalOpen(true)}
            >
              <KeyRound size={16} /> Sign in to continue
            </button>
          </div>
        )}

        <UnifiedAuthModal
          isOpen={authModalOpen}
          initialRole="admin"
          onClose={() => setAuthModalOpen(false)}
        />
      </div>
    );
  }

  const ADMIN_NAV = [
    {
      group: 'Floor ops',
      items: [
        { id: 'reception', label: 'Reception', hint: 'Desk code', icon: KeyRound },
        { id: 'doctors', label: 'Doctors', hint: 'Roster', icon: Stethoscope },
        { id: 'queues', label: 'OPD queue', hint: 'Tokens today', icon: BarChart3 },
        { id: 'beds', label: 'Beds', hint: 'Ward occupancy', icon: Bed },
      ],
    },
    {
      group: 'Partners',
      items: [
        { id: 'volunteers', label: 'NGO / Volunteers', hint: 'Requisitions', icon: Users },
        { id: 'csr', label: 'CSR funding', hint: 'Equipment lists', icon: Building },
      ],
    },
    {
      group: 'Insights',
      items: [
        { id: 'analytics', label: 'Hospital pulse', hint: 'Staffing & footfall', icon: Activity },
        { id: 'reviews', label: 'Ratings', hint: 'Patient feedback', icon: Award },
        { id: 'audit', label: 'Audit log', hint: 'Events & sessions', icon: ShieldAlert },
      ],
    },
  ];

  const activeNavLabel = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.id === activeAdminTab)?.label || 'Admin';

  // ====================================================
  // RENDER: FULL ADMIN WORKSPACE
  // ====================================================
  return (
    <div className="admin-workspace admin-workspace--console">
      <header className="admin-console-top">
        <div className="admin-console-brand">
          <div className="admin-shield-icon">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h2>Hospital admin</h2>
            <p>Victoria · Command console</p>
          </div>
        </div>
        <div className="admin-console-top-right">
          <div className="admin-session-badge">
            <div className="admin-badge-avatar">{(user?.name || 'A').slice(0, 1).toUpperCase()}</div>
            <div className="admin-badge-info">
              <strong>{user?.name || 'Admin'}</strong>
              <span>Administrator</span>
            </div>
          </div>
          <button type="button" onClick={logout} className="btn btn-outline admin-signout-btn">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      <div className="admin-console-body">
        <aside className="admin-side-nav" aria-label="Admin sections">
          {ADMIN_NAV.map((group) => (
            <div key={group.group} className="admin-side-group">
              <div className="admin-side-group-label">{group.group}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeAdminTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-side-link ${active ? 'active' : ''}`}
                    onClick={() => {
                      setActiveAdminTab(item.id);
                      if (item.id === 'reviews') fetchReviewAnalytics();
                    }}
                  >
                    <Icon size={18} />
                    <span className="admin-side-link-text">
                      <strong>{item.label}</strong>
                      <em>{item.hint}</em>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <section className="admin-main-pane">
          <div className="admin-pane-header">
            <h3>{activeNavLabel}</h3>
            {alertMsg && (
              <div className={`status-alert admin-inline-alert ${alertType === 'error' ? 'alert-error' : 'alert-success'}`}>
                {alertType === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                <span>{alertMsg}</span>
              </div>
            )}
          </div>

          <div className="admin-pane-scroll">

      {/* ========================================================== */}
      {/* TAB 0: RECEPTION CHECK-IN DESK                             */}
      {/* ========================================================== */}
      {activeAdminTab === 'reception' && (
        <div className="card" style={{ padding: '28px 24px', marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', color: '#0f172a' }}>Victoria OPD Reception Desk</h3>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', maxWidth: 520, lineHeight: 1.45 }}>
                Show this code to patients at the counter. They enter it on the patient app to unlock Today&apos;s visit.
                Code expires in 15 minutes. Digital intake stays locked until check-in.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                href="/reception-display"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
              >
                <ExternalLink size={14} /> Open desk display
              </a>
              <button type="button" className="btn btn-outline" onClick={fetchReceptionCode} disabled={receptionLoading}>
                <RefreshCw size={14} /> Refresh
              </button>
              <button type="button" className="btn btn-primary" onClick={handleGenerateReceptionCode} disabled={receptionLoading}>
                <KeyRound size={14} /> New code
              </button>
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
            borderRadius: 16,
            padding: '36px 24px',
            textAlign: 'center',
            color: '#fff',
            boxShadow: '0 12px 40px rgba(15, 23, 42, 0.25)',
          }}>
            <div style={{ fontSize: '0.75rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10, fontWeight: 700 }}>
              Live desk code · {receptionCode?.hospital_name || 'Victoria Hospital'}
            </div>
            <div style={{
              fontSize: 'clamp(2.8rem, 8vw, 4.5rem)',
              fontWeight: 900,
              letterSpacing: '0.35em',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              marginBottom: 14,
              color: '#f8fafc',
            }}>
              {receptionLoading && !receptionCode ? '······' : (receptionCode?.code || '—')}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', padding: '8px 16px', borderRadius: 999, fontSize: '0.9rem' }}>
              <Clock size={16} />
              {receptionCountdown > 0
                ? `Expires in ${Math.floor(receptionCountdown / 60)}:${String(receptionCountdown % 60).padStart(2, '0')}`
                : 'Expired — generating a fresh code…'}
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Hospital</div>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 4 }}>HOSP-BLR-001 · Victoria</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Generated</div>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{formatUtcDateTime(receptionCode?.generated_at)}</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Patient sees</div>
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 4, fontSize: '0.85rem' }}>/reception-display on the desk TV, then types it in Today&apos;s visit</div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 1: DOCTOR & STAFF ROSTER                               */}
      {/* ========================================================== */}
      {activeAdminTab === 'doctors' && (
        <>
          {summary && (
            <div className="admin-metrics-row">
              <div className="admin-metric-card">
                <span className="admin-metric-label">Total Doctors</span>
                <strong className="admin-metric-val">{summary.total_doctors}</strong>
                <span className="admin-metric-sub">Across {summary.departments_count} departments</span>
              </div>
              <div className="admin-metric-card">
                <span className="admin-metric-label">Senior Consultants</span>
                <strong className="admin-metric-val" style={{ color: '#b45309' }}>{summary.senior_doctors}</strong>
                <span className="admin-metric-sub">Emergency & Red Tier routing</span>
              </div>
              <div className="admin-metric-card">
                <span className="admin-metric-label">Junior Residents</span>
                <strong className="admin-metric-val" style={{ color: '#0369a1' }}>{summary.junior_doctors}</strong>
                <span className="admin-metric-sub">Amber / Green OPD intake</span>
              </div>
              <div className="admin-metric-card">
                <span className="admin-metric-label">Permanent Regular</span>
                <strong className="admin-metric-val" style={{ color: '#15803d' }}>{summary.permanent_doctors}</strong>
                <span className="admin-metric-sub">Tenured medical staff</span>
              </div>
              <div className="admin-metric-card">
                <span className="admin-metric-label">Temporary / Contract</span>
                <strong className="admin-metric-val" style={{ color: '#86198f' }}>{summary.temporary_doctors}</strong>
                <span className="admin-metric-sub">Visiting / Ad-hoc specialists</span>
              </div>
              <div className="admin-metric-card">
                <span className="admin-metric-label">Available on Duty</span>
                <strong className="admin-metric-val" style={{ color: '#059669' }}>{summary.available_doctors}</strong>
                <span className="admin-metric-sub">Ready for consultation</span>
              </div>
            </div>
          )}

          <div className="roster-control-panel">
            <div className="roster-top-actions">
              <div className="search-box-wrap">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search doctor by name, qualification, designation or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={fetchDoctorsAndSummary}
                  className="btn btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <RefreshCw size={14} className={loadingDoctors ? 'spinner-icon' : ''} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenCreateDoctor}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <UserPlus size={16} />
                  <span>Add New Doctor</span>
                </button>
              </div>
            </div>

            <div className="filter-chips-cluster">
              <select className="filter-select" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                <option value="">All Departments (12)</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select className="filter-select" value={filterTier} onChange={(e) => setFilterTier(e.target.value)}>
                <option value="">All Tiers</option>
                <option value="SENIOR_DOCTOR">Senior Consultants</option>
                <option value="JUNIOR_DOCTOR">Junior Residents</option>
              </select>

              <select className="filter-select" value={filterEmployment} onChange={(e) => setFilterEmployment(e.target.value)}>
                <option value="">All Tenures (Tenure)</option>
                <option value="PERMANENT">Permanent Regular</option>
                <option value="CONTRACT_TEMPORARY">Contract / Temporary</option>
              </select>

              <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="AVAILABLE">Available</option>
                <option value="BUSY">Busy</option>
                <option value="ON_BREAK">On Break</option>
                <option value="OFFLINE">Offline</option>
              </select>
            </div>
          </div>

          {loadingDoctors ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw size={24} className="spinner-icon" style={{ margin: '0 auto 10px' }} />
              <p>Loading doctor roster...</p>
            </div>
          ) : doctors.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
              <Users size={32} style={{ margin: '0 auto 10px', color: '#94a3b8' }} />
              <h4>No doctors found matching filters</h4>
              <p>Adjust your search query or department filter.</p>
            </div>
          ) : (
            <div className="doctors-cards-grid">
              {doctors.map((doc) => {
                const isSenior = doc.tier === 'SENIOR_DOCTOR';
                const isPermanent = doc.employment_type === 'PERMANENT';

                return (
                  <div key={doc.doctor_id} className="doctor-card">
                    <div className="doctor-card-header">
                      <div className="doctor-avatar-row">
                        <div className={`doc-avatar ${isSenior ? 'senior' : ''}`}>
                          {isSenior ? 'SR' : 'JR'}
                        </div>
                        <div className="doc-main-info">
                          <h4>{doc.name}</h4>
                          <span className="doc-id-tag">{doc.doctor_id}</span>
                        </div>
                      </div>

                      <select
                        className={`status-dropdown ${doc.status}`}
                        value={doc.status}
                        onChange={(e) => handleStatusChange(doc.doctor_id, e.target.value)}
                        title="Click to update live status"
                      >
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="BUSY">BUSY</option>
                        <option value="ON_BREAK">ON BREAK</option>
                        <option value="OFFLINE">OFFLINE</option>
                      </select>
                    </div>

                    <div className="doc-badges-row">
                      <span className={`badge-tier ${isSenior ? 'senior' : 'junior'}`}>
                        {isSenior ? 'Senior Consultant' : 'Junior Resident'}
                      </span>
                      <span className={`badge-employment ${isPermanent ? 'permanent' : 'contract'}`}>
                        {isPermanent ? 'Permanent' : 'Contract / Temp'}
                      </span>
                      <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                        {doc.department}
                      </span>
                    </div>

                    <div className="doctor-details-table">
                      <div className="detail-row">
                        <span>Designation:</span>
                        <strong>{doc.designation}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Qualification:</span>
                        <strong>{doc.qualification} ({doc.experience_years} yrs exp)</strong>
                      </div>
                      <div className="detail-row">
                        <span>Chamber / Desk:</span>
                        <strong>{doc.room_number}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Assigned Shift:</span>
                        <strong>{doc.shift}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Email:</span>
                        <span style={{ fontSize: '0.76rem', color: '#0369a1' }}>{doc.email}</span>
                      </div>
                    </div>

                    <div className="card-actions-row">
                      <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Max Queue: <strong>{doc.max_active_patients} pts</strong>
                      </span>
                      <div className="btn-card-group">
                        <button
                          type="button"
                          onClick={() => handleOpenEditDoctor(doc)}
                          className="btn-icon-action"
                        >
                          <Edit size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDoctor(doc.doctor_id, doc.name)}
                          className="btn-icon-action delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ========================================================== */}
      {/* TAB 2: VOLUNTEER & NGO COORDINATION (OPERATIONAL NOW)      */}
      {/* ========================================================== */}
      {activeAdminTab === 'volunteers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Volunteer Sub-Tabs */}
          <div className="volunteer-tabs-strip">
            <button
              type="button"
              className={`vol-subtab-btn ${volunteerSubTab === 'request' ? 'active' : ''}`}
              onClick={() => setVolunteerSubTab('request')}
            >
              <HeartHandshake size={15} />
              <span>Request Volunteers (Hospital Needs)</span>
            </button>
            <button
              type="button"
              className={`vol-subtab-btn ${volunteerSubTab === 'check_requests' ? 'active' : ''}`}
              onClick={() => setVolunteerSubTab('check_requests')}
            >
              <Users size={15} />
              <span>Check NGO Requests (Applications)</span>
              <span style={{ background: '#e2e8f0', color: '#475569', fontSize: '0.68rem', padding: '1px 6px', borderRadius: '10px' }}>
                {volunteerApplications.length}
              </span>
            </button>
          </div>

          {/* SUBTAB 1: REQUEST VOLUNTEERS */}
          {volunteerSubTab === 'request' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>
                    Hospital Volunteer Requirements
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                    Post public hospital requirements for crowd navigation, wheelchair mobility, and language assistance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVolModalOpen(true)}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={16} /> Post Volunteer Requisition
                </button>
              </div>

              {loadingVolunteers ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  <RefreshCw size={24} className="spinner-icon" style={{ margin: '0 auto 10px' }} />
                  <p>Loading requisitions...</p>
                </div>
              ) : volunteerRequisitions.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  <HeartHandshake size={36} style={{ margin: '0 auto 10px', color: '#94a3b8' }} />
                  <h4>No active volunteer requirements posted yet</h4>
                  <p>Click "Post Volunteer Requisition" above to request volunteers for hospital departments.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                  {volunteerRequisitions.map((req) => (
                    <div key={req.requisition_id} className="requisition-card">
                      <div className="requisition-header">
                        <div>
                          <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#1e3a8a', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>
                            {req.requisition_id}
                          </span>
                          <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
                            {req.title}
                          </h4>
                          <span style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 700 }}>
                            Department: {req.department}
                          </span>
                        </div>
                        <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.72rem', fontWeight: 900, padding: '3px 8px', borderRadius: '12px' }}>
                          {req.status}
                        </span>
                      </div>

                      <div className="requisition-meta-row">
                        <div className="meta-chip-item">
                          <span>Volunteers Needed:</span>
                          <strong>{req.number_of_volunteers}</strong>
                        </div>
                        <div className="meta-chip-item">
                          <span>Daily Duration:</span>
                          <strong>{req.duration_per_day}</strong>
                        </div>
                        <div className="meta-chip-item">
                          <span>Total Days:</span>
                          <strong>{req.total_days} Days</strong>
                        </div>
                      </div>

                      {req.description && (
                        <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: '1.4' }}>
                          {req.description}
                        </p>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          Posted: {formatUtcDate(req.created_at)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteRequisition(req.requisition_id)}
                          className="btn-icon-action delete"
                        >
                          <Trash2 size={13} /> Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 2: CHECK NGO REQUESTS (CURRENTLY EMPTY & DYNAMIC) */}
          {volunteerSubTab === 'check_requests' && (
            <div className="card" style={{ padding: '30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <Users size={22} style={{ color: '#1e3a8a' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Incoming NGO & Volunteer Applications</h3>
              </div>

              {volunteerApplications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px' }}>
                  <Users size={40} style={{ color: '#94a3b8', margin: '0 auto 12px' }} />
                  <h4 style={{ color: '#334155', fontWeight: 800 }}>No NGO Applications Received Yet</h4>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '520px', margin: '6px auto 0' }}>
                    Live inbox from the footer NGO portal. When an NGO organization registers, signs in, and applies to an opening, it appears here for review.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {volunteerApplications.map((app) => (
                    <div key={app.application_id} className="requisition-card">
                      <div className="requisition-header">
                        <div>
                          <h4>{app.ngo_name}</h4>
                          <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                            {app.application_id} · {app.requisition_title || app.requisition_id} · Offered <strong>{app.volunteers_offered}</strong>
                            {app.applicant_name ? ` · Liaison: ${app.applicant_name}` : ''}
                            {app.phone ? ` · ${app.phone}` : ''}
                            {app.email ? ` · ${app.email}` : ''}
                          </span>
                          {(app.skills || []).length > 0 && (
                            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 4 }}>
                              Skills: {(app.skills || []).join(', ')}
                            </div>
                          )}
                        </div>
                        <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800 }}>
                          {app.status}
                        </span>
                      </div>
                      {(app.status === 'PENDING' || app.status === 'ACCEPTED') && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          {app.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ fontSize: '0.78rem', background: '#059669', borderColor: '#059669' }}
                                onClick={async () => {
                                  try {
                                    await api.patch(`/admin/volunteers/applications/${app.application_id}/status`, { status: 'ACCEPTED' });
                                    showAlert(`Accepted ${app.application_id}`);
                                    fetchVolunteerData();
                                  } catch (err) {
                                    showAlert(err.response?.data?.detail || 'Update failed', 'error');
                                  }
                                }}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ fontSize: '0.78rem' }}
                                onClick={async () => {
                                  try {
                                    await api.patch(`/admin/volunteers/applications/${app.application_id}/status`, { status: 'REJECTED' });
                                    showAlert(`Rejected ${app.application_id}`);
                                    fetchVolunteerData();
                                  } catch (err) {
                                    showAlert(err.response?.data?.detail || 'Update failed', 'error');
                                  }
                                }}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {app.status === 'ACCEPTED' && (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ fontSize: '0.78rem', background: '#1d4ed8', borderColor: '#1d4ed8' }}
                              onClick={async () => {
                                try {
                                  await api.patch(`/admin/volunteers/applications/${app.application_id}/status`, { status: 'DEPLOYED' });
                                  showAlert(`Deployed ${app.application_id} on site`);
                                  fetchVolunteerData();
                                } catch (err) {
                                  showAlert(err.response?.data?.detail || 'Update failed', 'error');
                                }
                              }}
                            >
                              Mark deployed
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 3: CSR FUNDING & MULTI-ITEM HOSPITAL REQUIREMENTS      */}
      {/* ========================================================== */}
      {activeAdminTab === 'csr' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>
                Hospital Requirements for Corporate CSR Sponsorship
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                Multi-item equipment demands with dynamic lifecycle: <code>POSTED</code> &rarr; <code>CSR_PLEDGED</code> &rarr; <code>FULFILLED</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCsrModalOpen(true)}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} /> Post New Requirement List
            </button>
          </div>

          {loadingCsr ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw size={24} className="spinner-icon" style={{ margin: '0 auto 10px' }} />
              <p>Loading hospital CSR requirements...</p>
            </div>
          ) : csrRequirements.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <Building size={36} style={{ margin: '0 auto 10px', color: '#94a3b8' }} />
              <h4>No hospital requirements posted yet</h4>
              <p>Click "Post New Requirement List" above to create a multi-item equipment requirement for corporate sponsorship.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {csrRequirements.map((req) => {
                const isPosted = req.status === 'POSTED';
                const isPledged = req.status === 'CSR_PLEDGED';
                const isFulfilled = req.status === 'FULFILLED';

                return (
                  <div key={req.requirement_id} className="csr-card">
                    <div className="csr-card-top">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#1e3a8a', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>
                            {req.requirement_id}
                          </span>
                          <span className={`csr-priority-badge ${req.priority}`}>
                            {req.priority} PRIORITY
                          </span>
                          <span style={{ fontSize: '0.76rem', color: '#047857', fontWeight: 700 }}>
                            {req.department}
                          </span>
                        </div>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>
                          {req.title}
                        </h4>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className={`csr-status-pill ${req.status}`}>
                          {req.status === 'POSTED' && 'POSTED (Awaiting CSR)'}
                          {req.status === 'CSR_PLEDGED' && 'CSR PLEDGED'}
                          {req.status === 'FULFILLED' && '✓ FULFILLED'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCsrRequirement(req.requirement_id)}
                          className="btn-icon-action delete"
                          title="Delete requirement list"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.45' }}>
                      {req.description}
                    </p>

                    {/* Multi-Item Equipment Table */}
                    <table className="csr-items-table">
                      <thead>
                        <tr>
                          <th>Item / Equipment Description</th>
                          <th style={{ width: '80px', textAlign: 'center' }}>Qty</th>
                          <th style={{ width: '140px', textAlign: 'right' }}>Estimated Cost / Unit</th>
                          <th style={{ width: '140px', textAlign: 'right' }}>Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {req.items && req.items.map((it, idx) => (
                          <tr key={idx}>
                            <td><strong>{it.item_name}</strong></td>
                            <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                            <td style={{ textAlign: 'right' }}>₹{it.estimated_cost?.toLocaleString()}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                              ₹{(it.quantity * it.estimated_cost)?.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="csr-total-cost-strip">
                      <span>Total Requisition Funding Target:</span>
                      <strong>₹{req.total_estimated_cost?.toLocaleString()}</strong>
                    </div>

                    {/* CSR Sponsor Banner (if pledged or fulfilled) */}
                    {req.csr_sponsor && (
                      <div className="csr-sponsor-banner">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Gift size={18} style={{ color: '#86198f' }} />
                          <div>
                            <span style={{ fontSize: '0.74rem', color: '#86198f', fontWeight: 800 }}>COMMITTED CSR SPONSOR:</span>
                            <strong style={{ display: 'block', fontSize: '0.92rem', color: '#581c87' }}>
                              {req.csr_sponsor.company_name}
                            </strong>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#581c87' }}>
                          <span>Pledged Amount: <strong>₹{req.csr_sponsor.pledged_amount?.toLocaleString()}</strong></span>
                        </div>
                      </div>
                    )}

                    {/* Dynamic Lifecycle Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                      {isPosted && (
                        <button
                          type="button"
                          onClick={() => handleOpenPledgeModal(req)}
                          className="btn btn-primary"
                          style={{ fontSize: '0.84rem', padding: '8px 14px', background: '#7c3aed', borderColor: '#7c3aed' }}
                        >
                          <Gift size={14} style={{ marginRight: '6px' }} /> Record CSR Interest / Pledge
                        </button>
                      )}

                      {isPledged && (
                        <button
                          type="button"
                          onClick={() => handleFulfillRequirement(req.requirement_id)}
                          className="btn btn-primary"
                          style={{ fontSize: '0.84rem', padding: '8px 14px', background: '#059669', borderColor: '#059669' }}
                        >
                          <Check size={15} style={{ marginRight: '6px' }} /> Mark Items Received (Fulfilled)
                        </button>
                      )}

                      {isFulfilled && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#047857', fontWeight: 800, fontSize: '0.85rem' }}>
                          <CheckCircle2 size={16} /> Verified & Received at Hospital Wards
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 4: OPD TOKEN ANALYTICS & INFLOW MONITORING             */}
      {/* ========================================================== */}
      {activeAdminTab === 'queues' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header & Filter Controls */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <BarChart3 size={24} style={{ color: '#0284c7' }} />
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                    OPD Token Analytics & Patient Inflow Monitoring
                  </h3>
                  <span style={{ background: '#dbeafe', color: '#1e40af', fontSize: '0.74rem', fontWeight: 800, padding: '3px 8px', borderRadius: '12px' }}>
                    ADMINISTRATIVE TELEMETRY
                  </span>
                </div>
                <p style={{ color: '#64748b', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
                  Analytical overview of hospital patient intake volumes, footfall trends, and departmental load.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={fetchTokenAnalytics}
                  disabled={loadingAnalytics}
                  className="btn btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                >
                  <RefreshCw size={15} className={loadingAnalytics ? 'spin' : ''} />
                  <span>{loadingAnalytics ? 'Refreshing...' : 'Refresh Analytics'}</span>
                </button>
              </div>
            </div>

            {/* Filter Ribbon: Today, Date, Month, Department */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Timeframe:</span>
                {[
                  { id: 'today', label: 'Today' },
                  { id: 'date', label: 'Specific Date' },
                  { id: 'month', label: 'By Month' },
                  { id: 'all', label: 'All-Time' }
                ].map((tf) => (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => setTimeframeFilter(tf.id)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      fontWeight: timeframeFilter === tf.id ? 800 : 600,
                      border: `1px solid ${timeframeFilter === tf.id ? '#0284c7' : '#cbd5e1'}`,
                      background: timeframeFilter === tf.id ? '#0284c7' : '#ffffff',
                      color: timeframeFilter === tf.id ? '#ffffff' : '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    {tf.label}
                  </button>
                ))}

                {/* Date Picker if 'date' selected */}
                {timeframeFilter === 'date' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
                    <Calendar size={15} style={{ color: '#0284c7' }} />
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="filter-select"
                      style={{ padding: '4px 10px', fontSize: '0.82rem' }}
                    />
                  </div>
                )}

                {/* Month Picker if 'month' selected */}
                {timeframeFilter === 'month' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
                    <Calendar size={15} style={{ color: '#0284c7' }} />
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="filter-select"
                      style={{ padding: '4px 10px', fontSize: '0.82rem' }}
                    />
                  </div>
                )}
              </div>

              {/* Department Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Department:</span>
                <select
                  value={analyticsDeptFilter}
                  onChange={(e) => setAnalyticsDeptFilter(e.target.value)}
                  className="filter-select"
                  style={{ minWidth: '180px', padding: '6px 10px', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All Departments</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                  <option value="Emergency Care Ward">Emergency Care Ward</option>
                </select>
              </div>
            </div>

            {/* Core Analytics KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginTop: '20px' }}>
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '16px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase' }}>
                  Total Patient Inflow
                </span>
                <h3 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0c4a6e', margin: '4px 0 0' }}>
                  {analyticsData?.total_tokens || 0}
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#0284c7' }}>
                  Tokens in selected period
                </span>
              </div>

              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase' }}>
                  High Urgency / Emergency
                </span>
                <h3 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#991b1b', margin: '4px 0 0' }}>
                  {analyticsData?.severity_distribution?.RED || 0}
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#b91c1c' }}>
                  Flagged severe cases
                </span>
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>
                  Routine & Moderate
                </span>
                <h3 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#166534', margin: '4px 0 0' }}>
                  {(analyticsData?.severity_distribution?.GREEN || 0) + (analyticsData?.severity_distribution?.AMBER || 0)}
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#16a34a' }}>
                  Standard outpatient cases
                </span>
              </div>

              <div style={{ background: '#fdf4ff', border: '1px solid #f0abfc', borderRadius: '8px', padding: '16px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#a21caf', textTransform: 'uppercase' }}>
                  Departments Active
                </span>
                <h3 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#86198f', margin: '4px 0 0' }}>
                  {Object.keys(analyticsData?.department_distribution || {}).length}
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#a21caf' }}>
                  With patient registrations
                </span>
              </div>
            </div>

            {/* Department Inflow Distribution Matrix */}
            {analyticsData?.department_distribution && Object.keys(analyticsData.department_distribution).length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                  Department Footfall Distribution Breakdown:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                  {Object.entries(analyticsData.department_distribution).map(([dept, count]) => {
                    const total = analyticsData.total_tokens || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={dept} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>{dept}</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0284c7' }}>{count} ({pct}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#0284c7' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Inflow Monitoring Ledger (Read-Only Table) */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Patient Inflow Monitoring Ledger
                </h4>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  Read-only audit telemetry for administrative record-keeping. (Total: {analyticsData?.tokens?.length || 0} records)
                </p>
              </div>
            </div>

            {loadingAnalytics ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: '#0284c7' }} />
                <p style={{ fontSize: '0.85rem' }}>Loading token inflow telemetry...</p>
              </div>
            ) : !analyticsData?.tokens || analyticsData.tokens.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                <Clock size={32} style={{ color: '#cbd5e1', margin: '0 auto 10px' }} />
                <h5 style={{ fontWeight: 800, color: '#334155' }}>No Inflow Records Found</h5>
                <p style={{ fontSize: '0.84rem', margin: '4px auto 0' }}>
                  No patient intake tokens found for the selected timeframe and department filter.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Token Number</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Date & Time</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Patient Name</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Department</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Complaint / Findings</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Assigned Chamber</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Triage Urgency</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsData.tokens.map((t) => {
                      const isRed = t.priority === 'RED';
                      const isAmber = t.priority === 'AMBER';
                      const badgeBg = isRed ? '#fef2f2' : isAmber ? '#fffbeb' : '#f0fdf4';
                      const badgeColor = isRed ? '#b91c1c' : isAmber ? '#b45309' : '#15803d';

                      return (
                        <tr key={t.token_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 800, color: '#0f172a' }}>
                            <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px' }}>
                              {t.token_number}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.8rem' }}>
                            {formatUtcDateTime(t.created_at)}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                            {t.patient_name}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#334155' }}>
                            {t.department}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.chief_complaint}>
                            "{t.chief_complaint}"
                          </td>
                          <td style={{ padding: '10px 12px', color: '#0369a1', fontWeight: 600 }}>
                            {t.assigned_room}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 800, padding: '3px 8px', borderRadius: '10px', background: badgeBg, color: badgeColor }}>
                              {t.priority}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '4px' }}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 5: BED ALLOCATION & WARDS (live Mongo ward_beds)         */}
      {/* ========================================================== */}
      {activeAdminTab === 'beds' && (
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Bed size={22} style={{ color: '#16a34a' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Bed Allocation & Wards</h3>
              </div>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.86rem' }}>
                {bedData?.hospital_name || 'Victoria Hospital'} · live occupancy from ward inventory
              </p>
            </div>
            <button type="button" className="btn btn-outline" onClick={fetchBedInventory} disabled={loadingBeds}>
              <RefreshCw size={14} className={loadingBeds ? 'spin' : ''} /> Refresh
            </button>
          </div>

          {loadingBeds && !bedData ? (
            <p style={{ color: '#64748b' }}>Loading ward beds…</p>
          ) : !bedData ? (
            <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 28, textAlign: 'center', color: '#64748b' }}>
              No ward inventory yet. Restart API to seed defaults, then refresh.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#15803d' }}>TOTAL BEDS</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#166534' }}>{bedData.total_beds}</div>
                </div>
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#c2410c' }}>OCCUPIED</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#9a3412' }}>{bedData.occupied_beds}</div>
                </div>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8' }}>AVAILABLE</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#1e40af' }}>{bedData.available_beds}</div>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>OCCUPANCY</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{bedData.occupancy_pct}%</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(bedData.wards || []).map((w) => {
                  const pressureColor = w.pressure === 'critical' ? '#b91c1c' : w.pressure === 'high' ? '#b45309' : '#15803d';
                  const pressureBg = w.pressure === 'critical' ? '#fef2f2' : w.pressure === 'high' ? '#fffbeb' : '#ecfdf5';
                  return (
                    <div key={w.ward_id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <strong style={{ fontSize: '0.95rem' }}>{w.ward_name}</strong>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {w.ward_id} · {w.ward_type} · {w.occupied_beds}/{w.total_beds} occupied · {w.available_beds} free
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 8px', borderRadius: 999, background: pressureBg, color: pressureColor, textTransform: 'uppercase' }}>
                          {w.pressure} · {w.occupancy_pct}%
                        </span>
                      </div>
                      <div style={{ marginTop: 10, height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, w.occupancy_pct || 0)}%`, height: '100%', background: pressureColor }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Occupied</label>
                        <input
                          type="number"
                          min={0}
                          max={w.total_beds}
                          defaultValue={w.occupied_beds}
                          id={`occ-${w.ward_id}`}
                          style={{ width: 80, padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                        />
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Total</label>
                        <input
                          type="number"
                          min={1}
                          defaultValue={w.total_beds}
                          id={`tot-${w.ward_id}`}
                          style={{ width: 80, padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ fontSize: 12, padding: '6px 12px' }}
                          onClick={() => {
                            const occ = document.getElementById(`occ-${w.ward_id}`)?.value;
                            const tot = document.getElementById(`tot-${w.ward_id}`)?.value;
                            updateWardOccupancy(w.ward_id, occ, tot);
                          }}
                        >
                          Save
                        </button>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Updated {formatUtcDateTime(w.updated_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB: RATINGS & REVIEWS — facility / dept / doctor / ward   */}
      {/* ========================================================== */}
      {activeAdminTab === 'reviews' && (() => {
        const bandStyle = (band) => ({
          green: { bg: '#ecfdf5', border: '#a7f3d0', color: '#047857' },
          yellow: { bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
          red: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
        }[band] || { bg: '#f8fafc', border: '#e2e8f0', color: '#475569' });
        const pill = (band, text) => {
          const s = bandStyle(band);
          return (
            <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, color: s.color, textTransform: 'uppercase' }}>
              {text || band}
            </span>
          );
        };
        const scoreCard = (label, avg, band, count) => {
          const s = bandStyle(band);
          return (
            <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: s.color, textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: '1.55rem', fontWeight: 900, color: s.color }}>{avg != null ? `${avg}★` : '—'}</div>
              <div style={{ fontSize: '0.74rem', color: s.color, opacity: 0.85 }}>{count || 0} reviews · {band}</div>
            </div>
          );
        };
        const deptChart = (reviewAnalytics?.departments || []).map((d) => {
          const name = String(d.department || 'Department');
          return {
            department: name.length > 14 ? `${name.slice(0, 12)}…` : name,
            avg: d.avg_department_rating,
            fill: d.severity_band === 'red' ? '#dc2626' : d.severity_band === 'yellow' ? '#d97706' : '#059669',
          };
        });
        const trend = (reviewAnalytics?.trend_last_14_days || []).map((t) => ({
          ...t,
          avg: t.avg_overall_rating ?? t.avg_hospital_rating ?? 0,
        }));

        return (
        <div className="card" style={{ padding: '24px', marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', color: '#0f172a' }}>Ratings analysis</h3>
              <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b' }}>
                {reviewAnalytics?.hospital_name || 'Victoria Hospital'} · facility · department · doctor · ward · emergency bad-review lookup
              </p>
            </div>
            <button type="button" className="btn btn-outline" onClick={fetchReviewAnalytics} disabled={loadingReviews}>
              <RefreshCw size={14} className={loadingReviews ? 'spin' : ''} /> Refresh
            </button>
          </div>

          {loadingReviews && !reviewAnalytics ? (
            <p style={{ color: '#64748b' }}>Loading review analytics…</p>
          ) : !reviewAnalytics || reviewAnalytics.total_reviews === 0 ? (
            <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 28, textAlign: 'center', color: '#64748b' }}>
              No structured reviews yet. Patients submit from the Reviews tab.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                {scoreCard('Overall', reviewAnalytics.overall?.avg_rating, reviewAnalytics.overall?.severity_band, reviewAnalytics.total_reviews)}
                {scoreCard('Facility', reviewAnalytics.facility?.avg_rating, reviewAnalytics.facility?.severity_band, reviewAnalytics.facility?.review_count)}
                {scoreCard('Emergency flags', reviewAnalytics.emergency_count, reviewAnalytics.emergency_count > 0 ? 'red' : 'green', reviewAnalytics.emergency_count)}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Legend</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {pill('green', 'Good ≥4')}
                    {pill('yellow', 'Avg 3')}
                    {pill('red', 'Bad ≤2')}
                  </div>
                </div>
              </div>

              {(reviewAnalytics.xai_hospital_summary || reviewAnalytics.overall?.xai_summary) && (
                <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, padding: 14, marginBottom: 18 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', marginBottom: 4 }}>XAI · Hospital brief</div>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#4c1d95', lineHeight: 1.5 }}>
                    {reviewAnalytics.xai_hospital_summary || reviewAnalytics.overall?.xai_summary}
                  </p>
                  {reviewAnalytics.facility?.xai_summary && (
                    <p style={{ margin: '8px 0 0', fontSize: '0.84rem', color: '#5b21b6', lineHeight: 1.45 }}>
                      {reviewAnalytics.facility.xai_summary}
                    </p>
                  )}
                </div>
              )}

              {/* Emergency lookup */}
              <div style={{ border: '1.5px solid #fecaca', background: '#fff5f5', borderRadius: 12, padding: 14, marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <strong style={{ color: '#991b1b' }}>Emergency lookup — very bad reviews (≤2★)</strong>
                  {pill('red', `${reviewAnalytics.emergency_count || 0} alerts`)}
                </div>
                {(reviewAnalytics.emergency_alerts || []).length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b' }}>No critical facility / department / doctor / ward alerts.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                    {(reviewAnalytics.emergency_alerts || []).slice(0, 12).map((a) => (
                      <div key={a.id} style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.86rem', color: '#7f1d1d' }}>
                            {String(a.target_type || '').toUpperCase()} · {a.target_name} · {a.rating}★
                          </strong>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{formatUtcDateTime(a.created_at)}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>
                          {a.department ? `${a.department} · ` : ''}{a.doctor_name || ''}{a.ward_name ? ` · ${a.ward_name}` : ''}{a.token_number ? ` · Token ${a.token_number}` : ''}
                        </div>
                        {a.comment && <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: 4 }}>&ldquo;{a.comment}&rdquo;</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 18 }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                  <strong style={{ display: 'block', marginBottom: 8 }}>Facility star mix</strong>
                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer>
                      <BarChart data={reviewAnalytics.facility?.rating_distribution || reviewAnalytics.hospital_rating_distribution || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="stars" tickFormatter={(v) => `${v}★`} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {(reviewAnalytics.facility?.rating_distribution || reviewAnalytics.hospital_rating_distribution || []).map((entry) => (
                            <Cell
                              key={`c-${entry.stars}`}
                              fill={entry.stars <= 2 ? '#dc2626' : entry.stars === 3 ? '#d97706' : '#059669'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem', color: '#64748b' }}>
                    <span style={{ color: '#dc2626' }}>1–2 red</span>
                    <span style={{ color: '#d97706' }}>3 yellow</span>
                    <span style={{ color: '#059669' }}>4–5 green</span>
                  </div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                  <strong style={{ display: 'block', marginBottom: 8 }}>By department</strong>
                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer>
                      <BarChart data={deptChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 5]} />
                        <Tooltip />
                        <Bar dataKey="avg" name="Dept avg ★" radius={[6, 6, 0, 0]}>
                          {deptChart.map((entry, idx) => (
                            <Cell key={`dept-${idx}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                  <strong style={{ display: 'block', marginBottom: 8 }}>14-day trend</strong>
                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer>
                      <LineChart data={trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" allowDecimals={false} />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 5]} />
                        <Tooltip />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="reviews" name="Reviews" stroke="#0284c7" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="avg" name="Avg ★" stroke="#d97706" strokeWidth={2} dot={false} />
                        <Line yAxisId="left" type="monotone" dataKey="bad_reviews" name="Bad flags" stroke="#dc2626" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Department → doctors hierarchy + XAI */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <strong style={{ display: 'block', marginBottom: 6, color: '#0f172a' }}>Department → doctors</strong>
                <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b' }}>
                  Open a department to see nested doctor ratings and XAI rationale (why green / yellow / red).
                </p>
                {(reviewAnalytics.departments || []).map((d) => {
                  const s = bandStyle(d.severity_band);
                  return (
                    <details key={d.department} style={{ border: `1px solid ${s.border}`, background: s.bg, borderRadius: 10, marginBottom: 10, padding: '4px 12px 10px' }} open={d.severity_band === 'red'}>
                      <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '10px 0', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{d.department}</span>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 900, color: s.color }}>{d.avg_department_rating}★</span>
                          {pill(d.severity_band)}
                          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{(d.doctors || []).length} doctor{(d.doctors || []).length === 1 ? '' : 's'}</span>
                        </span>
                      </summary>
                      <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: 8 }}>
                        Facility {d.avg_facility_rating}★ · Doctors {d.avg_doctor_rating}★ · Ward {d.avg_ward_rating}★ · {d.review_count} reviews
                        {d.bad_review_count > 0 ? ` · ${d.bad_review_count} emergency-flagged` : ''}
                      </div>
                      {d.xai_summary && (
                        <div style={{ background: '#fff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: '0.82rem', color: '#5b21b6', lineHeight: 1.45 }}>
                          {d.xai_summary}
                        </div>
                      )}
                      {(d.doctors || []).length === 0 ? (
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>No doctor-tagged reviews in this department yet.</p>
                      ) : (
                        (d.doctors || []).map((doc) => {
                          const ds = bandStyle(doc.severity_band);
                          return (
                            <div key={doc.doctor_id || doc.doctor_name} style={{ background: '#fff', border: `1px solid ${ds.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{doc.doctor_name}</strong>
                                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span style={{ fontWeight: 900, color: ds.color }}>{doc.avg_rating}★</span>
                                  {pill(doc.severity_band)}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                                {doc.review_count} reviews{doc.bad_review_count ? ` · ${doc.bad_review_count} bad (≤2★)` : ''}
                              </div>
                              {doc.xai_summary && (
                                <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#4c1d95', lineHeight: 1.4 }}>{doc.xai_summary}</div>
                              )}
                              {doc.latest_bad_comment && (
                                <div style={{ marginTop: 4, fontSize: '0.8rem', color: '#7f1d1d' }}>&ldquo;{doc.latest_bad_comment}&rdquo;</div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </details>
                  );
                })}
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                <strong style={{ display: 'block', marginBottom: 10 }}>Wards / chambers</strong>
                {(reviewAnalytics.wards || []).map((w) => {
                  const s = bandStyle(w.severity_band);
                  return (
                    <div key={w.ward_name} style={{ borderTop: '1px solid #f1f5f9', padding: '8px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ fontSize: '0.86rem' }}>{w.ward_name}</strong>
                        <span style={{ fontWeight: 800, color: s.color }}>{w.avg_rating}★</span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{w.review_count} reviews · bad {w.bad_review_count || 0} {pill(w.severity_band)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        );
      })()}

      {/* ========================================================== */}
      {/* TAB 6: HOSPITAL ANALYTICS (live roster + OPD + partners)    */}
      {/* ========================================================== */}
      {activeAdminTab === 'analytics' && (
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity size={22} style={{ color: '#0f766e' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Hospital Analytics & Footfall</h3>
              </div>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.86rem' }}>
                Live staffing, today&apos;s OPD triage, beds, and partner pipeline — not static preview text.
              </p>
            </div>
            <button type="button" className="btn btn-outline" onClick={fetchHospitalInsights} disabled={loadingHospitalInsights}>
              <RefreshCw size={14} className={loadingHospitalInsights ? 'spin' : ''} /> Refresh
            </button>
          </div>

          {loadingHospitalInsights && !hospitalInsights ? (
            <p style={{ color: '#64748b' }}>Loading hospital analytics…</p>
          ) : !hospitalInsights ? (
            <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 28, textAlign: 'center', color: '#64748b' }}>
              No analytics yet. Sign in as admin and refresh.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#0f766e' }}>DOCTORS</div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{hospitalInsights.doctors?.total || 0}</div>
                </div>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8' }}>TOKENS TODAY</div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{hospitalInsights.opd_today?.tokens || 0}</div>
                </div>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c' }}>RED</div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{hospitalInsights.opd_today?.triage?.RED || 0}</div>
                </div>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309' }}>AMBER</div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{hospitalInsights.opd_today?.triage?.AMBER || 0}</div>
                </div>
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#15803d' }}>GREEN</div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{hospitalInsights.opd_today?.triage?.GREEN || 0}</div>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>BED OCC.</div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{hospitalInsights.beds?.occupancy_pct || 0}%</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                  <strong style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>Department staffing (roster)</strong>
                  {(hospitalInsights.doctors?.staffing_by_department || []).length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: 13 }}>No doctors in roster for this hospital.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflow: 'auto' }}>
                      {hospitalInsights.doctors.staffing_by_department.map((row) => (
                        <div key={row.department} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, borderTop: '1px solid #f1f5f9', paddingTop: 6 }}>
                          <span>{row.department}</span>
                          <strong>{row.total} · {row.senior} SR / {row.junior} JR</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                  <strong style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>OPD footfall by department (today)</strong>
                  {(hospitalInsights.opd_today?.by_department || []).length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: 13 }}>No tokens issued today yet.</p>
                  ) : (
                    <div style={{ height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hospitalInsights.opd_today.by_department}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="department" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                  <strong style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>Partner pipeline</strong>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: '#334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Open volunteer requisitions</span>
                      <strong>{hospitalInsights.partners?.open_volunteer_requisitions || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Pending NGO applications</span>
                      <strong>{hospitalInsights.partners?.pending_volunteer_applications || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Open / pledged CSR lists</span>
                      <strong>{hospitalInsights.partners?.open_csr_requirements || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                      <span>Beds available</span>
                      <strong>{hospitalInsights.beds?.available_beds || 0} / {hospitalInsights.beds?.total_beds || 0}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 7: AUDIT LOGS (hospital_events + sessions)             */}
      {/* ========================================================== */}
      {activeAdminTab === 'audit' && (
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShieldCheck size={22} style={{ color: '#0369a1' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Audit Logs & Security</h3>
              </div>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.86rem' }}>
                Live `hospital_events` stream + recent login sessions — not fabricated log lines.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={auditEventFilter}
                onChange={(e) => {
                  setAuditEventFilter(e.target.value);
                  fetchAuditLogs(e.target.value);
                }}
                className="filter-select"
                style={{ minWidth: 180 }}
              >
                <option value="ALL">All event types</option>
                {(auditData?.event_types || []).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button type="button" className="btn btn-outline" onClick={() => fetchAuditLogs()} disabled={loadingAudit}>
                <RefreshCw size={14} className={loadingAudit ? 'spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {loadingAudit && !auditData ? (
            <p style={{ color: '#64748b' }}>Loading audit trail…</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(260px, 1fr)', gap: 14 }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 800, fontSize: 13 }}>
                  Hospital events ({auditData?.total || 0})
                </div>
                {(auditData?.events || []).length === 0 ? (
                  <div style={{ padding: 24, color: '#64748b', fontSize: 13 }}>No events yet for this hospital.</div>
                ) : (
                  <div style={{ maxHeight: 420, overflow: 'auto' }}>
                    {(auditData.events || []).map((ev) => (
                      <div key={ev.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <strong style={{ color: '#0f172a' }}>{ev.event_type}</strong>
                          <span style={{ color: '#64748b' }}>{formatUtcDateTime(ev.timestamp)}</span>
                        </div>
                        <div style={{ color: '#475569', marginTop: 4, lineHeight: 1.4 }}>{ev.summary}</div>
                        {ev.actor && <div style={{ color: '#94a3b8', marginTop: 2 }}>Actor: {ev.actor}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 800, fontSize: 13 }}>
                  Recent sessions
                </div>
                {(auditData?.recent_sessions || []).length === 0 ? (
                  <div style={{ padding: 24, color: '#64748b', fontSize: 13 }}>No session records.</div>
                ) : (
                  <div style={{ maxHeight: 420, overflow: 'auto' }}>
                    {(auditData.recent_sessions || []).map((s) => (
                      <div key={s.session_id || `${s.email}-${s.login_at}`} style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                        <strong>{s.name || s.email}</strong>
                        <div style={{ color: '#64748b' }}>{s.role} · {s.email}</div>
                        <div style={{ color: '#94a3b8', marginTop: 2 }}>Login {formatUtcDateTime(s.login_at)}</div>
                        {s.ip_address && <div style={{ color: '#94a3b8' }}>IP {s.ip_address}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
          </div>
        </section>
      </div>

      {/* ========================================================== */}
      {/* MODAL 1: CREATE OR EDIT DOCTOR                             */}
      {/* ========================================================== */}
      {modalOpen && (
        <div className="doctor-modal-overlay">
          <div className="doctor-modal-window">
            <div className="doctor-modal-header">
              <h3>{modalMode === 'create' ? 'Register New Doctor to Hospital Roster' : `Edit Doctor Profile: ${selectedDoctorId}`}</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleDoctorFormSubmit}>
              <div className="doctor-modal-body">
                {formError && (
                  <div className="status-alert alert-error">
                    <AlertCircle size={16} /> <span>{formError}</span>
                  </div>
                )}

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>Doctor Full Name (with prefix) *</label>
                    <input
                      type="text"
                      required
                      placeholder="Dr. Rajesh Sharma"
                      value={doctorForm.name}
                      onChange={(e) => setDoctorForm({ ...doctorForm, name: e.target.value })}
                      className="filter-select"
                    />
                  </div>

                  <div className="form-field-group">
                    <label>Clinical Department *</label>
                    <select
                      value={doctorForm.department}
                      onChange={(e) => setDoctorForm({ ...doctorForm, department: e.target.value })}
                      className="filter-select"
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>Doctor Tier (Hierarchy) *</label>
                    <select
                      value={doctorForm.tier}
                      onChange={(e) => setDoctorForm({ ...doctorForm, tier: e.target.value })}
                      className="filter-select"
                    >
                      <option value="JUNIOR_DOCTOR">Junior Resident (Routine Triage)</option>
                      <option value="SENIOR_DOCTOR">Senior Consultant (Emergency / Red Triage)</option>
                    </select>
                  </div>

                  <div className="form-field-group">
                    <label>Employment Type (Tenure) *</label>
                    <select
                      value={doctorForm.employment_type}
                      onChange={(e) => setDoctorForm({ ...doctorForm, employment_type: e.target.value })}
                      className="filter-select"
                    >
                      <option value="PERMANENT">Permanent Regular Staff</option>
                      <option value="CONTRACT_TEMPORARY">Contract / Temporary Staff</option>
                    </select>
                  </div>
                </div>

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>Designation / Post *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Senior Resident, Assistant Professor"
                      value={doctorForm.designation}
                      onChange={(e) => setDoctorForm({ ...doctorForm, designation: e.target.value })}
                      className="filter-select"
                    />
                  </div>

                  <div className="form-field-group">
                    <label>Medical Qualifications *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MBBS, MD, DNB"
                      value={doctorForm.qualification}
                      onChange={(e) => setDoctorForm({ ...doctorForm, qualification: e.target.value })}
                      className="filter-select"
                    />
                  </div>
                </div>

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>Clinical Experience (Years) *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={doctorForm.experience_years}
                      onChange={(e) => setDoctorForm({ ...doctorForm, experience_years: parseInt(e.target.value, 10) || 0 })}
                      className="filter-select"
                    />
                  </div>

                  <div className="form-field-group">
                    <label>Chamber / OPD Desk *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. OPD Desk 102, Chamber 4"
                      value={doctorForm.room_number}
                      onChange={(e) => setDoctorForm({ ...doctorForm, room_number: e.target.value })}
                      className="filter-select"
                    />
                  </div>
                </div>

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>Assigned Shift *</label>
                    <select
                      value={doctorForm.shift}
                      onChange={(e) => setDoctorForm({ ...doctorForm, shift: e.target.value })}
                      className="filter-select"
                    >
                      <option value="Morning (09:00 - 14:00)">Morning (09:00 - 14:00)</option>
                      <option value="Evening (14:00 - 20:00)">Evening (14:00 - 20:00)</option>
                      <option value="Night (20:00 - 08:00)">Night (20:00 - 08:00)</option>
                    </select>
                  </div>

                  <div className="form-field-group">
                    <label>Hospital Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="dr.name@sushrutha.gov.in"
                      value={doctorForm.email}
                      onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })}
                      className="filter-select"
                    />
                  </div>
                </div>

                {/* OPD Days Selector */}
                <div className="form-field-group">
                  <label>Scheduled OPD Duty Days</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                    {ALL_DAYS.map((day) => {
                      const isSelected = doctorForm.opd_days.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => handleDayToggle(day)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${isSelected ? '#1e3a8a' : '#cbd5e1'}`,
                            background: isSelected ? '#eff6ff' : '#ffffff',
                            color: isSelected ? '#1e3a8a' : '#475569',
                            fontWeight: isSelected ? 800 : 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                          }}
                        >
                          {isSelected ? '✓ ' : ''}{day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="doctor-modal-footer">
                <button type="button" onClick={() => setModalOpen(false)} className="btn btn-outline">
                  Cancel
                </button>
                <button type="submit" disabled={formSubmitting} className="btn btn-primary">
                  <CheckCircle2 size={16} />
                  <span>{formSubmitting ? 'Saving...' : modalMode === 'create' ? 'Save Doctor to Roster' : 'Update Doctor Profile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 2: POST VOLUNTEER REQUISITION                        */}
      {/* ========================================================== */}
      {volModalOpen && (
        <div className="doctor-modal-overlay">
          <div className="doctor-modal-window" style={{ maxWidth: '580px' }}>
            <div className="doctor-modal-header">
              <h3>Post Hospital Volunteer Requirement</h3>
              <button type="button" onClick={() => setVolModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRequisitionSubmit}>
              <div className="doctor-modal-body">
                <div className="form-field-group">
                  <label>Requirement Title / Task Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Outpatient Queue Assistance & Wheelchair Escort"
                    value={volForm.title}
                    onChange={(e) => setVolForm({ ...volForm, title: e.target.value })}
                    className="filter-select"
                  />
                </div>

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>Department / Location *</label>
                    <select
                      value={volForm.department}
                      onChange={(e) => setVolForm({ ...volForm, department: e.target.value })}
                      className="filter-select"
                    >
                      <option value="Main OPD Lobby">Main OPD Lobby</option>
                      <option value="Geriatric & Senior Clinic">Geriatric & Senior Clinic</option>
                      <option value="Emergency Care Ward">Emergency Care Ward</option>
                      <option value="Orthopedics Mobility Escort">Orthopedics Mobility Escort</option>
                      <option value="Pediatrics Registration Help">Pediatrics Registration Help</option>
                    </select>
                  </div>

                  <div className="form-field-group">
                    <label>Number of Volunteers Required *</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      required
                      value={volForm.number_of_volunteers}
                      onChange={(e) => setVolForm({ ...volForm, number_of_volunteers: parseInt(e.target.value, 10) || 1 })}
                      className="filter-select"
                    />
                  </div>
                </div>

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>Duration Per Day *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 4 Hours / Day (Morning Shift)"
                      value={volForm.duration_per_day}
                      onChange={(e) => setVolForm({ ...volForm, duration_per_day: e.target.value })}
                      className="filter-select"
                    />
                  </div>

                  <div className="form-field-group">
                    <label>Total Days *</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      required
                      placeholder="e.g. 14 Days"
                      value={volForm.total_days}
                      onChange={(e) => setVolForm({ ...volForm, total_days: parseInt(e.target.value, 10) || 1 })}
                      className="filter-select"
                    />
                  </div>
                </div>

                <div className="form-field-group">
                  <label>Task Description / Preferred Skills</label>
                  <textarea
                    rows="3"
                    placeholder="e.g. Assist elderly patients from main entrance, help fill registration slips, basic Kannada/English communication."
                    value={volForm.description}
                    onChange={(e) => setVolForm({ ...volForm, description: e.target.value })}
                    className="filter-select"
                    style={{ fontFamily: 'inherit' }}
                  ></textarea>
                </div>
              </div>

              <div className="doctor-modal-footer">
                <button type="button" onClick={() => setVolModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" disabled={volSubmitting} className="btn btn-primary">
                  {volSubmitting ? 'Posting...' : 'Publish Volunteer Requisition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 3: POST CSR MULTI-ITEM HOSPITAL REQUIREMENTS         */}
      {/* ========================================================== */}
      {csrModalOpen && (
        <div className="doctor-modal-overlay">
          <div className="doctor-modal-window" style={{ maxWidth: '720px' }}>
            <div className="doctor-modal-header">
              <h3>Post Hospital Requirements List for CSR Sponsorship</h3>
              <button type="button" onClick={() => setCsrModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateCsrSubmit}>
              <div className="doctor-modal-body">
                <div className="form-field-group">
                  <label>Requirement Title / Project Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pediatrics NICU Thermal Care & Monitoring Upgrade"
                    value={csrForm.title}
                    onChange={(e) => setCsrForm({ ...csrForm, title: e.target.value })}
                    className="filter-select"
                  />
                </div>

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>Hospital Department *</label>
                    <select
                      value={csrForm.department}
                      onChange={(e) => setCsrForm({ ...csrForm, department: e.target.value })}
                      className="filter-select"
                    >
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                      <option value="Emergency & Trauma">Emergency & Trauma</option>
                      <option value="Central ICU">Central ICU</option>
                      <option value="Dialysis Center">Dialysis Center</option>
                    </select>
                  </div>

                  <div className="form-field-group">
                    <label>Priority of Complete List *</label>
                    <select
                      value={csrForm.priority}
                      onChange={(e) => setCsrForm({ ...csrForm, priority: e.target.value })}
                      className="filter-select"
                    >
                      <option value="CRITICAL">CRITICAL (Emergency / Life-Saving)</option>
                      <option value="HIGH">HIGH (Essential Ward Care)</option>
                      <option value="MEDIUM">MEDIUM (Infrastructure & Support)</option>
                    </select>
                  </div>
                </div>

                <div className="form-field-group">
                  <label>Clinical Justification / Description *</label>
                  <textarea
                    rows="2"
                    required
                    placeholder="Explain clinical necessity and patient benefit for corporate CSR evaluation..."
                    value={csrForm.description}
                    onChange={(e) => setCsrForm({ ...csrForm, description: e.target.value })}
                    className="filter-select"
                    style={{ fontFamily: 'inherit' }}
                  ></textarea>
                </div>

                {/* Dynamic Multi-Item List Builder */}
                <div className="csr-items-builder">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                      Required Items List (Add / Remove Items)
                    </strong>
                    <button
                      type="button"
                      onClick={handleAddCsrItemRow}
                      className="btn btn-outline"
                      style={{ fontSize: '0.76rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Plus size={13} /> Add Item Row
                    </button>
                  </div>

                  {csrForm.items.map((it, idx) => (
                    <div key={idx} className="csr-item-input-row">
                      <input
                        type="text"
                        required
                        placeholder="Item Name (e.g. Neonatal Warmer)"
                        value={it.item_name}
                        onChange={(e) => handleCsrItemChange(idx, 'item_name', e.target.value)}
                        className="filter-select"
                        style={{ padding: '8px 10px' }}
                      />
                      <input
                        type="number"
                        min="1"
                        required
                        placeholder="Qty"
                        value={it.quantity}
                        onChange={(e) => handleCsrItemChange(idx, 'quantity', e.target.value)}
                        className="filter-select"
                        style={{ padding: '8px 10px' }}
                      />
                      <input
                        type="number"
                        min="1"
                        required
                        placeholder="Est. Cost ₹"
                        value={it.estimated_cost}
                        onChange={(e) => handleCsrItemChange(idx, 'estimated_cost', e.target.value)}
                        className="filter-select"
                        style={{ padding: '8px 10px' }}
                      />
                      {csrForm.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCsrItemRow(idx)}
                          className="btn-icon-action delete"
                          title="Delete this item row"
                          style={{ padding: '8px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Estimated List Total:</span>
                    <strong style={{ color: '#1e3a8a', fontSize: '1.05rem' }}>
                      ₹{csrForm.items.reduce((sum, it) => sum + ((parseInt(it.quantity, 10) || 0) * (parseFloat(it.estimated_cost) || 0)), 0).toLocaleString()}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="doctor-modal-footer">
                <button type="button" onClick={() => setCsrModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" disabled={csrSubmitting} className="btn btn-primary">
                  {csrSubmitting ? 'Posting...' : 'Publish Requirement List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 4: RECORD CSR PLEDGE                                 */}
      {/* ========================================================== */}
      {pledgeModalOpen && pledgeTargetReq && (
        <div className="doctor-modal-overlay">
          <div className="doctor-modal-window" style={{ maxWidth: '540px' }}>
            <div className="doctor-modal-header">
              <h3>Record CSR Corporate Pledge</h3>
              <button type="button" onClick={() => setPledgeModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePledgeSubmit}>
              <div className="doctor-modal-body">
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800 }}>TARGET REQUISITION:</span>
                  <strong style={{ display: 'block', fontSize: '0.94rem', color: '#0f172a' }}>{pledgeTargetReq.title}</strong>
                  <span style={{ fontSize: '0.78rem', color: '#0369a1' }}>Target Goal: ₹{pledgeTargetReq.total_estimated_cost?.toLocaleString()}</span>
                </div>

                <div className="form-field-group">
                  <label>Corporate Sponsor / Foundation Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Infosys Foundation, Wipro Cares, Tata Trusts"
                    value={pledgeForm.company_name}
                    onChange={(e) => setPledgeForm({ ...pledgeForm, company_name: e.target.value })}
                    className="filter-select"
                  />
                </div>

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>CSR Contact Person</label>
                    <input
                      type="text"
                      placeholder="e.g. Head of CSR Healthcare"
                      value={pledgeForm.contact_person}
                      onChange={(e) => setPledgeForm({ ...pledgeForm, contact_person: e.target.value })}
                      className="filter-select"
                    />
                  </div>

                  <div className="form-field-group">
                    <label>Corporate Email</label>
                    <input
                      type="email"
                      placeholder="csr@company.com"
                      value={pledgeForm.email}
                      onChange={(e) => setPledgeForm({ ...pledgeForm, email: e.target.value })}
                      className="filter-select"
                    />
                  </div>
                </div>

                <div className="form-field-group">
                  <label>Pledged Amount (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={pledgeForm.pledged_amount}
                    onChange={(e) => setPledgeForm({ ...pledgeForm, pledged_amount: e.target.value })}
                    className="filter-select"
                  />
                </div>

                <div className="form-field-group">
                  <label>Grant Notes / MOU Details (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Approved under FY26 CSR public hospital health grant"
                    value={pledgeForm.notes}
                    onChange={(e) => setPledgeForm({ ...pledgeForm, notes: e.target.value })}
                    className="filter-select"
                  />
                </div>
              </div>

              <div className="doctor-modal-footer">
                <button type="button" onClick={() => setPledgeModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" disabled={pledgeSubmitting} className="btn btn-primary" style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
                  {pledgeSubmitting ? 'Recording...' : 'Confirm CSR Pledge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
