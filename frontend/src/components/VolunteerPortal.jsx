import React, { useEffect, useState } from 'react';
import { LogOut, RefreshCw, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SwitchAccountPanel } from './RoleGate';
import PartnerAuthModal from './PartnerAuthModal';
import api from '../services/api';
import { useHospitalWebSocket } from '../services/useHospitalWebSocket';

const OPERATIONAL_HID = 'HOSP-BLR-001';

/** NGO org is the account: user.name = ngo_name, user.department = liaison */
const emptyApply = (user) => ({
  requisition_id: '',
  ngo_name: user?.name || '',
  liaison_name: user?.department || '',
  phone: user?.phone || '',
  email: user?.email || '',
  volunteers_offered: 2,
  skills: '',
  notes: '',
});

export default function VolunteerPortal() {
  const { user, isAuthenticated, logout } = useAuth();
  const isNgo = user?.role === 'volunteer' || user?.role === 'admin';
  const [authOpen, setAuthOpen] = useState(false);
  const [authView, setAuthView] = useState('login');

  const [hospitals, setHospitals] = useState([]);
  const [hospitalId, setHospitalId] = useState(OPERATIONAL_HID);
  const [openReqs, setOpenReqs] = useState([]);
  const [myApps, setMyApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [applyForm, setApplyForm] = useState(() => emptyApply(user));
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setAuthOpen(true);
      setAuthView('login');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (user) {
      setApplyForm((prev) => ({
        ...prev,
        ngo_name: prev.ngo_name || user.name || '',
        liaison_name: prev.liaison_name || user.department || '',
        phone: prev.phone || user.phone || '',
        email: prev.email || user.email || '',
      }));
    }
  }, [user]);

  const loadOpen = async (hid = hospitalId) => {
    setLoading(true);
    try {
      const res = await api.get('/partners/volunteers/open', { params: { hospital_id: hid } });
      setOpenReqs(res.data?.data || []);
    } catch {
      setOpenReqs([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMine = async () => {
    try {
      const res = await api.get('/partners/volunteers/my-applications');
      setMyApps(res.data?.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    api.get('/partners/hospitals').then((res) => setHospitals(res.data?.data || [])).catch(() => {
      setHospitals([{ hospital_id: OPERATIONAL_HID, name: 'Victoria Hospital' }]);
    });
  }, []);

  useEffect(() => {
    if (!isNgo) return;
    loadOpen(hospitalId);
    loadMine();
  }, [isNgo, hospitalId]);

  useHospitalWebSocket((payload) => {
    if (!isNgo) return;
    if (payload.event === 'VOLUNTEER_REQUISITION_POSTED' || payload.event === 'VOLUNTEER_APPLICATION_SUBMITTED') {
      loadOpen(hospitalId);
      loadMine();
    }
  });

  const handleApply = async (e) => {
    e.preventDefault();
    if (!applyForm.requisition_id) {
      setMsg('Select a hospital opening first.');
      return;
    }
    if (!applyForm.ngo_name.trim()) {
      setMsg('NGO / organization name is required.');
      return;
    }
    setApplying(true);
    setMsg(null);
    try {
      await api.post('/partners/volunteers/apply', {
        requisition_id: applyForm.requisition_id,
        hospital_id: hospitalId,
        ngo_name: applyForm.ngo_name.trim(),
        // Admin inbox still has applicant_name — used as NGO liaison, not individual volunteer account
        applicant_name: (applyForm.liaison_name.trim() || applyForm.ngo_name.trim()),
        phone: applyForm.phone.trim() || undefined,
        email: applyForm.email.trim() || undefined,
        volunteers_offered: Number(applyForm.volunteers_offered) || 1,
        skills: applyForm.skills.split(',').map((s) => s.trim()).filter(Boolean),
        notes: applyForm.notes.trim() || undefined,
      });
      setMsg('NGO application sent to hospital admin.');
      setApplyForm(emptyApply(user));
      loadOpen(hospitalId);
      loadMine();
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Could not apply.');
    } finally {
      setApplying(false);
    }
  };

  if (isAuthenticated && !isNgo) {
    return <div className="partner-portal"><SwitchAccountPanel currentUser={user} onLogout={logout} targetLabel="NGO" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="partner-portal partner-gate">
        <p>Register or sign in as an NGO organization.</p>
        <div className="partner-gate-actions">
          <button type="button" className="btn btn-primary" onClick={() => { setAuthView('login'); setAuthOpen(true); }}>NGO sign in</button>
          <button type="button" className="btn btn-outline" onClick={() => { setAuthView('register'); setAuthOpen(true); }}>Register NGO</button>
        </div>
        <PartnerAuthModal
          isOpen={authOpen}
          initialRole="volunteer"
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
          <h1>NGO portal</h1>
          <p>
            <strong>{user?.name}</strong>
            {user?.department ? ` · Liaison: ${user.department}` : ' · Organization account'}
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => logout(true)}><LogOut size={14} /> Sign out</button>
      </header>

      {msg && <p className="partner-flash">{msg}</p>}

      <label className="partner-field">
        Hospital
        <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
          {hospitals.map((h) => (
            <option key={h.hospital_id} value={h.hospital_id}>{h.name}</option>
          ))}
        </select>
      </label>

      <section className="partner-section">
        <div className="partner-section-head">
          <h2>Open hospital openings</h2>
          <button type="button" className="btn btn-outline" onClick={() => loadOpen(hospitalId)} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        {openReqs.length === 0 ? (
          <p className="partner-empty">No openings right now.</p>
        ) : (
          <ul className="partner-plain-list">
            {openReqs.map((r) => (
              <li key={r.requisition_id}>
                <div>
                  <strong>{r.title}</strong>
                  <span>{r.department} · {r.number_of_volunteers} volunteers needed · {r.duration_per_day}</span>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => setApplyForm((p) => ({ ...p, requisition_id: r.requisition_id }))}>
                  Choose
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="partner-section">
        <h2>Apply as NGO</h2>
        <form onSubmit={handleApply} className="partner-apply-form">
          <label>Opening ID *
            <input required value={applyForm.requisition_id} onChange={(e) => setApplyForm({ ...applyForm, requisition_id: e.target.value })} />
          </label>
          <label>NGO / organization name *
            <input required value={applyForm.ngo_name} onChange={(e) => setApplyForm({ ...applyForm, ngo_name: e.target.value })} placeholder="Registered NGO name" />
          </label>
          <label>Liaison name
            <input value={applyForm.liaison_name} onChange={(e) => setApplyForm({ ...applyForm, liaison_name: e.target.value })} placeholder="Person hospital can contact" />
          </label>
          <label>NGO phone
            <input type="tel" value={applyForm.phone} onChange={(e) => setApplyForm({ ...applyForm, phone: e.target.value })} />
          </label>
          <label>NGO email
            <input type="email" value={applyForm.email} onChange={(e) => setApplyForm({ ...applyForm, email: e.target.value })} />
          </label>
          <label>Volunteers your NGO can offer *
            <input type="number" min={1} required value={applyForm.volunteers_offered} onChange={(e) => setApplyForm({ ...applyForm, volunteers_offered: e.target.value })} />
          </label>
          <label>Skills your team brings
            <input value={applyForm.skills} onChange={(e) => setApplyForm({ ...applyForm, skills: e.target.value })} placeholder="Kannada, queue help, elderly care" />
          </label>
          <label>Notes
            <textarea rows={2} value={applyForm.notes} onChange={(e) => setApplyForm({ ...applyForm, notes: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={applying}>
            {applying ? <RefreshCw className="animate-spin" size={16} /> : <><Send size={16} /> Submit NGO application</>}
          </button>
        </form>
      </section>

      <section className="partner-section">
        <h2>Our applications</h2>
        {myApps.length === 0 ? (
          <p className="partner-empty">None yet.</p>
        ) : (
          <ul className="partner-plain-list">
            {myApps.map((a) => (
              <li key={a.application_id}>
                <div>
                  <strong>{a.ngo_name || user?.name}</strong>
                  <span>{a.requisition_title || a.requisition_id} · {a.volunteers_offered} offered · {a.application_id}</span>
                </div>
                <em>{a.status}</em>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
