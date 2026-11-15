import React, { useEffect, useState } from 'react';
import { LogOut, RefreshCw, HandHeart, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SwitchAccountPanel } from './RoleGate';
import PartnerAuthModal from './PartnerAuthModal';
import api from '../services/api';
import { useHospitalWebSocket } from '../services/useHospitalWebSocket';

const OPERATIONAL_HID = 'HOSP-BLR-001';

/** Company is the account: user.name = company_name, user.department = liaison */
const emptyInterest = (user, req) => ({
  company_name: user?.name || '',
  contact_person: user?.department || '',
  email: user?.email || '',
  pledged_amount: req?.total_estimated_cost != null ? String(req.total_estimated_cost) : '',
  notes: '',
});

export default function CSRPortal() {
  const { user, isAuthenticated, logout } = useAuth();
  const isCsr = user?.role === 'csr' || user?.role === 'admin';
  const [authOpen, setAuthOpen] = useState(false);
  const [authView, setAuthView] = useState('login');

  const [hospitals, setHospitals] = useState([]);
  const [hospitalId, setHospitalId] = useState('ALL');
  const [listings, setListings] = useState([]);
  const [myInterests, setMyInterests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [interestBusy, setInterestBusy] = useState(false);
  const [interestTarget, setInterestTarget] = useState(null);
  const [interestForm, setInterestForm] = useState(() => emptyInterest(user, null));

  useEffect(() => {
    if (!isAuthenticated) {
      setAuthOpen(true);
      setAuthView('login');
    }
  }, [isAuthenticated]);

  const loadListings = async () => {
    setLoading(true);
    try {
      const params = {};
      if (hospitalId !== 'ALL') params.hospital_id = hospitalId;
      const res = await api.get('/partners/csr/listings', { params });
      setListings(res.data?.data || []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMyInterests = async () => {
    if (!isCsr) return;
    try {
      const res = await api.get('/partners/csr/my-interests');
      setMyInterests(res.data?.data || []);
    } catch {
      setMyInterests([]);
    }
  };

  const refreshAll = async () => {
    await Promise.all([loadListings(), loadMyInterests()]);
  };

  useEffect(() => {
    api.get('/partners/hospitals').then((res) => setHospitals(res.data?.data || [])).catch(() => {
      setHospitals([{ hospital_id: OPERATIONAL_HID, name: 'Victoria Hospital' }]);
    });
  }, []);

  useEffect(() => {
    if (isCsr) refreshAll();
  }, [isCsr, hospitalId]);

  useHospitalWebSocket((payload) => {
    if (!isCsr) return;
    const ev = payload.event;
    if (
      ev === 'CSR_REQUIREMENT_POSTED' ||
      ev === 'CSR_INTEREST_CREATED' ||
      ev === 'CSR_INTEREST_ACCEPTED' ||
      ev === 'CSR_INTEREST_REJECTED' ||
      ev === 'CSR_PLEDGED' ||
      ev === 'CSR_PLEDGE_RECORDED' ||
      ev === 'CSR_FULFILLED'
    ) {
      refreshAll();
    }
  });

  const pendingForReq = (reqId) =>
    myInterests.find((i) => i.requirement_id === reqId && i.status === 'PENDING');

  const openInterest = (req) => {
    if (req.status !== 'POSTED') return;
    if (pendingForReq(req.requirement_id)) {
      setMsg('You already have a pending interest on this requirement.');
      return;
    }
    setInterestTarget(req);
    setInterestForm(emptyInterest(user, req));
    setMsg(null);
  };

  const handleInterestSubmit = async (e) => {
    e.preventDefault();
    if (!interestTarget) return;
    if (!interestForm.company_name.trim()) {
      setMsg('Company name is required.');
      return;
    }
    setInterestBusy(true);
    setMsg(null);
    try {
      await api.post(`/partners/csr/listings/${interestTarget.requirement_id}/interest`, {
        company_name: interestForm.company_name.trim(),
        contact_person: interestForm.contact_person.trim() || undefined,
        email: interestForm.email.trim() || undefined,
        pledged_amount: parseFloat(interestForm.pledged_amount) || interestTarget.total_estimated_cost,
        notes: interestForm.notes.trim() || undefined,
      });
      setMsg(`Interest submitted on ${interestTarget.requirement_id}. Hospital admin will review.`);
      setInterestTarget(null);
      refreshAll();
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Interest failed.');
    } finally {
      setInterestBusy(false);
    }
  };

  if (isAuthenticated && !isCsr) {
    return <div className="partner-portal"><SwitchAccountPanel currentUser={user} onLogout={logout} targetLabel="CSR" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="partner-portal partner-gate">
        <p>Sign in or register to continue.</p>
        <div className="partner-gate-actions">
          <button type="button" className="btn btn-primary" style={{ background: '#c2410c', borderColor: '#c2410c' }} onClick={() => { setAuthView('login'); setAuthOpen(true); }}>Sign in</button>
          <button type="button" className="btn btn-outline" onClick={() => { setAuthView('register'); setAuthOpen(true); }}>Register</button>
        </div>
        <PartnerAuthModal
          isOpen={authOpen}
          initialRole="csr"
          initialView={authView}
          onClose={() => setAuthOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="partner-portal">
      <header className="partner-toolbar">
        <div>
          <h1>CSR company portal</h1>
          <p>
            <strong>{user?.name}</strong>
            {user?.department ? ` · Contact: ${user.department}` : ' · Company account'}
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => logout(true)}><LogOut size={14} /> Sign out</button>
      </header>

      {msg && <p className="partner-flash">{msg}</p>}

      <div className="partner-toolbar-row">
        <label className="partner-field" style={{ flex: 1 }}>
          Hospital
          <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
            <option value="ALL">All hospitals</option>
            {hospitals.map((h) => (
              <option key={h.hospital_id} value={h.hospital_id}>{h.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-outline" onClick={refreshAll} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <section className="partner-section">
        <h2>Hospital requirements</h2>
        <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 12 }}>
          Express interest on a posted list. The hospital admin Accepts one company to lock the pledge — your list stays open until then.
        </p>
        {listings.length === 0 ? (
          <p className="partner-empty">No listings yet.</p>
        ) : (
          <ul className="partner-plain-list">
            {listings.map((r) => {
              const mine = pendingForReq(r.requirement_id);
              return (
                <li key={r.requirement_id} className="csr-row">
                  <div>
                    <strong>{r.title}</strong>
                    <span>{r.hospital_name} · {r.department} · {r.priority} · {r.status}</span>
                    <span>₹{Number(r.total_estimated_cost || 0).toLocaleString('en-IN')}</span>
                    {(r.items || []).length > 0 && (
                      <span className="csr-items">{(r.items || []).map((it) => `${it.item_name} ×${it.quantity}`).join(' · ')}</span>
                    )}
                    {r.csr_sponsor?.company_name && (
                      <span>Sponsor: {r.csr_sponsor.company_name}</span>
                    )}
                    {mine && <span style={{ color: '#c2410c', fontWeight: 700 }}>Your interest: PENDING</span>}
                  </div>
                  {r.status === 'POSTED' && !mine && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ background: '#c2410c', borderColor: '#c2410c' }}
                      onClick={() => openInterest(r)}
                    >
                      <HandHeart size={14} /> Express interest
                    </button>
                  )}
                  {r.status === 'POSTED' && mine && (
                    <span style={{ fontSize: '0.78rem', color: '#b45309', fontWeight: 800 }}>Awaiting admin</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="partner-section">
        <h2>My interests</h2>
        {myInterests.length === 0 ? (
          <p className="partner-empty">No interests submitted yet.</p>
        ) : (
          <ul className="partner-plain-list">
            {myInterests.map((i) => (
              <li key={i.interest_id} className="csr-row">
                <div>
                  <strong>{i.requirement_title || i.requirement_id}</strong>
                  <span>{i.interest_id} · {i.status}</span>
                  {i.pledged_amount != null && (
                    <span>Indicative ₹{Number(i.pledged_amount).toLocaleString('en-IN')}</span>
                  )}
                  {i.requirement_status && (
                    <span>Requirement: {i.requirement_status}</span>
                  )}
                </div>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: i.status === 'PENDING' ? '#fef3c7' : i.status === 'ACCEPTED' ? '#dcfce7' : '#fee2e2',
                  color: i.status === 'PENDING' ? '#b45309' : i.status === 'ACCEPTED' ? '#15803d' : '#b91c1c',
                }}>
                  {i.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {interestTarget && (
        <div className="doctor-modal-overlay" style={{ zIndex: 80 }}>
          <div className="doctor-modal-window" style={{ maxWidth: 540 }}>
            <div className="doctor-modal-header">
              <h3>Express CSR interest</h3>
              <button type="button" onClick={() => setInterestTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleInterestSubmit}>
              <div className="doctor-modal-body">
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800 }}>TARGET REQUISITION</span>
                  <strong style={{ display: 'block', fontSize: '0.94rem', color: '#0f172a' }}>{interestTarget.title}</strong>
                  <span style={{ fontSize: '0.78rem', color: '#0369a1' }}>
                    Funding target: ₹{Number(interestTarget.total_estimated_cost || 0).toLocaleString('en-IN')}
                  </span>
                  <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '8px 0 0' }}>
                    This does not lock the list. Hospital admin must Accept your interest before it becomes a pledged sponsorship.
                  </p>
                </div>

                <div className="form-field-group">
                  <label>Corporate sponsor / foundation name *</label>
                  <input
                    type="text"
                    required
                    className="filter-select"
                    placeholder="e.g. Infosys Foundation, Wipro Cares, Tata Trusts"
                    value={interestForm.company_name}
                    onChange={(e) => setInterestForm({ ...interestForm, company_name: e.target.value })}
                  />
                </div>

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>CSR contact person</label>
                    <input
                      type="text"
                      className="filter-select"
                      placeholder="e.g. Head of CSR Healthcare"
                      value={interestForm.contact_person}
                      onChange={(e) => setInterestForm({ ...interestForm, contact_person: e.target.value })}
                    />
                  </div>
                  <div className="form-field-group">
                    <label>Corporate email</label>
                    <input
                      type="email"
                      className="filter-select"
                      placeholder="csr@company.com"
                      value={interestForm.email}
                      onChange={(e) => setInterestForm({ ...interestForm, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-field-group">
                  <label>Indicative amount (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="filter-select"
                    value={interestForm.pledged_amount}
                    onChange={(e) => setInterestForm({ ...interestForm, pledged_amount: e.target.value })}
                  />
                </div>

                <div className="form-field-group">
                  <label>Grant notes / MOU details (optional)</label>
                  <input
                    type="text"
                    className="filter-select"
                    placeholder="e.g. Approved under FY26 CSR public hospital health grant"
                    value={interestForm.notes}
                    onChange={(e) => setInterestForm({ ...interestForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="doctor-modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setInterestTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={interestBusy} style={{ background: '#c2410c', borderColor: '#c2410c' }}>
                  {interestBusy ? 'Submitting…' : 'Submit interest'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
