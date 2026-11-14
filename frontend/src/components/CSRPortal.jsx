import React, { useEffect, useState } from 'react';
import { LogOut, RefreshCw, HandHeart, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SwitchAccountPanel } from './RoleGate';
import PartnerAuthModal from './PartnerAuthModal';
import api from '../services/api';
import { useHospitalWebSocket } from '../services/useHospitalWebSocket';

const OPERATIONAL_HID = 'HOSP-BLR-001';

/** Company is the account: user.name = company_name, user.department = liaison */
const emptyPledge = (user, req) => ({
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
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pledgeBusy, setPledgeBusy] = useState(false);
  const [pledgeTarget, setPledgeTarget] = useState(null);
  const [pledgeForm, setPledgeForm] = useState(() => emptyPledge(user, null));

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

  useEffect(() => {
    api.get('/partners/hospitals').then((res) => setHospitals(res.data?.data || [])).catch(() => {
      setHospitals([{ hospital_id: OPERATIONAL_HID, name: 'Victoria Hospital' }]);
    });
  }, []);

  useEffect(() => {
    if (isCsr) loadListings();
  }, [isCsr, hospitalId]);

  useHospitalWebSocket((payload) => {
    if (!isCsr) return;
    if (payload.event === 'CSR_REQUIREMENT_POSTED' || payload.event === 'CSR_PLEDGE_RECORDED') {
      loadListings();
    }
  });

  const openPledge = (req) => {
    if (req.status !== 'POSTED') return;
    setPledgeTarget(req);
    setPledgeForm(emptyPledge(user, req));
    setMsg(null);
  };

  const handlePledgeSubmit = async (e) => {
    e.preventDefault();
    if (!pledgeTarget) return;
    if (!pledgeForm.company_name.trim()) {
      setMsg('Company name is required.');
      return;
    }
    setPledgeBusy(true);
    setMsg(null);
    try {
      await api.post(`/partners/csr/listings/${pledgeTarget.requirement_id}/pledge`, {
        company_name: pledgeForm.company_name.trim(),
        contact_person: pledgeForm.contact_person.trim() || undefined,
        email: pledgeForm.email.trim() || undefined,
        pledged_amount: parseFloat(pledgeForm.pledged_amount) || pledgeTarget.total_estimated_cost,
        notes: pledgeForm.notes.trim() || undefined,
      });
      setMsg(`Pledge recorded on ${pledgeTarget.requirement_id}.`);
      setPledgeTarget(null);
      loadListings();
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Pledge failed.');
    } finally {
      setPledgeBusy(false);
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
        <button type="button" className="btn btn-outline" onClick={loadListings} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <section className="partner-section">
        <h2>Hospital requirements</h2>
        {listings.length === 0 ? (
          <p className="partner-empty">No listings yet.</p>
        ) : (
          <ul className="partner-plain-list">
            {listings.map((r) => (
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
                </div>
                {r.status === 'POSTED' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ background: '#c2410c', borderColor: '#c2410c' }}
                    onClick={() => openPledge(r)}
                  >
                    <HandHeart size={14} /> Pledge
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pledgeTarget && (
        <div className="doctor-modal-overlay" style={{ zIndex: 80 }}>
          <div className="doctor-modal-window" style={{ maxWidth: 540 }}>
            <div className="doctor-modal-header">
              <h3>Record CSR corporate pledge</h3>
              <button type="button" onClick={() => setPledgeTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePledgeSubmit}>
              <div className="doctor-modal-body">
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800 }}>TARGET REQUISITION</span>
                  <strong style={{ display: 'block', fontSize: '0.94rem', color: '#0f172a' }}>{pledgeTarget.title}</strong>
                  <span style={{ fontSize: '0.78rem', color: '#0369a1' }}>
                    Target goal: ₹{Number(pledgeTarget.total_estimated_cost || 0).toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="form-field-group">
                  <label>Corporate sponsor / foundation name *</label>
                  <input
                    type="text"
                    required
                    className="filter-select"
                    placeholder="e.g. Infosys Foundation, Wipro Cares, Tata Trusts"
                    value={pledgeForm.company_name}
                    onChange={(e) => setPledgeForm({ ...pledgeForm, company_name: e.target.value })}
                  />
                </div>

                <div className="form-2col-grid">
                  <div className="form-field-group">
                    <label>CSR contact person</label>
                    <input
                      type="text"
                      className="filter-select"
                      placeholder="e.g. Head of CSR Healthcare"
                      value={pledgeForm.contact_person}
                      onChange={(e) => setPledgeForm({ ...pledgeForm, contact_person: e.target.value })}
                    />
                  </div>
                  <div className="form-field-group">
                    <label>Corporate email</label>
                    <input
                      type="email"
                      className="filter-select"
                      placeholder="csr@company.com"
                      value={pledgeForm.email}
                      onChange={(e) => setPledgeForm({ ...pledgeForm, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-field-group">
                  <label>Pledged amount (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="filter-select"
                    value={pledgeForm.pledged_amount}
                    onChange={(e) => setPledgeForm({ ...pledgeForm, pledged_amount: e.target.value })}
                  />
                </div>

                <div className="form-field-group">
                  <label>Grant notes / MOU details (optional)</label>
                  <input
                    type="text"
                    className="filter-select"
                    placeholder="e.g. Approved under FY26 CSR public hospital health grant"
                    value={pledgeForm.notes}
                    onChange={(e) => setPledgeForm({ ...pledgeForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="doctor-modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setPledgeTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={pledgeBusy} style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
                  {pledgeBusy ? 'Recording…' : 'Confirm CSR pledge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
