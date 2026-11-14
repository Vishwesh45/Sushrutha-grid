import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, User, Mail, Lock, Phone, AlertCircle, CheckCircle2,
  ArrowRight, RefreshCw, Users, Gift, Building2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * NGO / CSR partner auth — organization accounts, not individual volunteers.
 * - NGO registers as the NGO (ngo_name is the account)
 * - CSR registers as the company (company_name is the account)
 */
export default function PartnerAuthModal({
  isOpen,
  onClose,
  onSuccess,
  initialRole = 'volunteer', // 'volunteer' | 'csr'
  initialView = 'login', // 'login' | 'register'
}) {
  const { login, register, logout } = useAuth();
  const role = initialRole === 'csr' ? 'csr' : 'volunteer';
  const isCsr = role === 'csr';

  const [view, setView] = useState(initialView);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [loginData, setLoginData] = useState({ email: '', password: '' });

  // NGO org account (core entity = NGO)
  const emptyNgo = {
    ngo_name: '',
    liaison_name: '',
    phone: '',
    email: '',
    password: '',
    confirm_password: '',
  };

  // CSR company account (core entity = company)
  const emptyCsr = {
    company_name: '',
    contact_person: '',
    email: '',
    password: '',
    confirm_password: '',
  };

  const [ngoReg, setNgoReg] = useState(emptyNgo);
  const [csrReg, setCsrReg] = useState(emptyCsr);

  const accent = isCsr ? '#c2410c' : '#0f766e';
  const soft = isCsr ? '#fff7ed' : '#f0fdfa';
  const TitleIcon = isCsr ? Gift : Users;

  useEffect(() => {
    if (!isOpen) return;
    setView(initialView === 'register' ? 'register' : 'login');
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoginData({ email: '', password: '' });
    setNgoReg(emptyNgo);
    setCsrReg(emptyCsr);
  }, [isOpen, initialRole, initialView]);

  if (!isOpen) return null;

  const finish = (signedRole) => {
    setSuccessMsg('Done.');
    if (onSuccess) onSuccess(signedRole);
    setTimeout(() => onClose(), 450);
  };

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  const apiDetail = (err, fallback) => {
    const d = err?.response?.data?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
    return fallback;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    const email = loginData.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setErrorMsg('Enter a valid organization email.');
      return;
    }
    if (!loginData.password) {
      setErrorMsg('Password is required.');
      return;
    }
    setLoading(true);
    try {
      const data = await login(email, loginData.password);
      const ok = isCsr
        ? (data.role === 'csr' || data.role === 'admin')
        : (data.role === 'volunteer' || data.role === 'admin');
      if (!ok) {
        await logout(true);
        setErrorMsg(isCsr ? 'Use a CSR company account.' : 'Use an NGO organization account.');
        return;
      }
      finish(isCsr ? 'csr' : 'volunteer');
    } catch (err) {
      setErrorMsg(apiDetail(err, 'Invalid email or password.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isCsr) {
      const company = csrReg.company_name.trim();
      const email = csrReg.email.trim().toLowerCase();
      if (!company || company.length < 2) {
        setErrorMsg('Enter company / foundation name.');
        return;
      }
      if (!isValidEmail(email)) {
        setErrorMsg('Enter a valid company email.');
        return;
      }
      if (!csrReg.password || csrReg.password.length < 6) {
        setErrorMsg('Password must be at least 6 characters.');
        return;
      }
      if (csrReg.password !== csrReg.confirm_password) {
        setErrorMsg('Passwords do not match.');
        return;
      }
      setLoading(true);
      try {
        await register({
          name: company,
          email,
          password: csrReg.password,
          role: 'csr',
          department: csrReg.contact_person.trim() || undefined,
        });
        await login(email, csrReg.password);
        finish('csr');
      } catch (err) {
        setErrorMsg(apiDetail(err, 'Registration failed.'));
      } finally {
        setLoading(false);
      }
      return;
    }

    const ngoName = ngoReg.ngo_name.trim();
    const email = ngoReg.email.trim().toLowerCase();
    const phoneDigits = (ngoReg.phone || '').replace(/\D/g, '').slice(-10);
    if (!ngoName || ngoName.length < 2) {
      setErrorMsg('Enter the NGO / organization name.');
      return;
    }
    if (!isValidEmail(email)) {
      setErrorMsg('Enter a valid NGO contact email.');
      return;
    }
    if (phoneDigits && !/^[6-9]\d{9}$/.test(phoneDigits)) {
      setErrorMsg('Enter a valid 10-digit Indian mobile, or leave blank.');
      return;
    }
    if (!ngoReg.password || ngoReg.password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (ngoReg.password !== ngoReg.confirm_password) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await register({
        name: ngoName,
        email,
        password: ngoReg.password,
        role: 'volunteer',
        phone: phoneDigits || undefined,
        department: ngoReg.liaison_name.trim() || undefined,
      });
      await login(email, ngoReg.password);
      finish('volunteer');
    } catch (err) {
      setErrorMsg(apiDetail(err, 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px 10px 38px',
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    fontSize: 14,
    boxSizing: 'border-box',
  };
  const inputPlain = { ...inputStyle, paddingLeft: 12 };
  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#334155',
    marginBottom: 6,
  };

  return createPortal(
    <div className="auth-modal-overlay" style={{ zIndex: 9999 }} role="dialog" aria-modal="true">
      <div className="auth-modal-card" style={{ padding: 0, maxWidth: 460 }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: soft }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TitleIcon size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                {isCsr ? 'CSR company' : 'NGO organization'}
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                {view === 'register'
                  ? (isCsr ? 'Register your company / foundation' : 'Register your NGO (organization account)')
                  : (isCsr ? 'Sign in as company' : 'Sign in as NGO')}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 6 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '20px 22px 22px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => { setView('login'); setErrorMsg(null); }}
              style={{
                flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                border: view === 'login' ? `1.5px solid ${accent}` : '1px solid #e2e8f0',
                background: view === 'login' ? soft : '#fff',
                color: view === 'login' ? accent : '#64748b',
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setView('register'); setErrorMsg(null); }}
              style={{
                flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                border: view === 'register' ? `1.5px solid ${accent}` : '1px solid #e2e8f0',
                background: view === 'register' ? soft : '#fff',
                color: view === 'register' ? accent : '#64748b',
              }}
            >
              Register
            </button>
          </div>

          {errorMsg && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>
              <AlertCircle size={15} /> {errorMsg}
            </div>
          )}
          {successMsg && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: 13 }}>
              <CheckCircle2 size={15} /> {successMsg}
            </div>
          )}

          {view === 'login' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <div style={{ position: 'relative' }}>
                  <input type="email" required value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} style={inputStyle} placeholder="name@email.com" />
                  <Mail size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input type="password" required value={loginData.password} onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} style={inputStyle} />
                  <Lock size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: 12, fontWeight: 800, background: accent, borderColor: accent }}>
                {loading ? <RefreshCw className="animate-spin" size={18} /> : <>Sign in <ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          {view === 'register' && !isCsr && (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelStyle}>NGO / organization name *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    required
                    value={ngoReg.ngo_name}
                    onChange={(e) => setNgoReg({ ...ngoReg, ngo_name: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g. Karuna Trust, Seva Bharathi"
                  />
                  <Building2 size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Liaison name (optional)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    value={ngoReg.liaison_name}
                    onChange={(e) => setNgoReg({ ...ngoReg, liaison_name: e.target.value })}
                    style={inputStyle}
                    placeholder="Person the hospital can call"
                  />
                  <User size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>NGO phone</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="tel"
                    value={ngoReg.phone}
                    onChange={(e) => setNgoReg({ ...ngoReg, phone: e.target.value })}
                    style={inputStyle}
                    placeholder="Organization contact number"
                  />
                  <Phone size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>NGO email *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    required
                    value={ngoReg.email}
                    onChange={(e) => setNgoReg({ ...ngoReg, email: e.target.value })}
                    style={inputStyle}
                    placeholder="office@ngo.org"
                  />
                  <Mail size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Password *</label>
                  <input type="password" required minLength={6} value={ngoReg.password} onChange={(e) => setNgoReg({ ...ngoReg, password: e.target.value })} style={inputPlain} />
                </div>
                <div>
                  <label style={labelStyle}>Confirm *</label>
                  <input type="password" required minLength={6} value={ngoReg.confirm_password} onChange={(e) => setNgoReg({ ...ngoReg, confirm_password: e.target.value })} style={inputPlain} />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: 12, fontWeight: 800, background: accent, borderColor: accent, marginTop: 4 }}>
                {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Register NGO'}
              </button>
            </form>
          )}

          {view === 'register' && isCsr && (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelStyle}>Corporate sponsor / foundation name *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    required
                    value={csrReg.company_name}
                    onChange={(e) => setCsrReg({ ...csrReg, company_name: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g. Infosys Foundation, Wipro Cares, Tata Trusts"
                  />
                  <Building2 size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>CSR contact person (optional)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    value={csrReg.contact_person}
                    onChange={(e) => setCsrReg({ ...csrReg, contact_person: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g. Head of CSR Healthcare"
                  />
                  <User size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Corporate email *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    required
                    value={csrReg.email}
                    onChange={(e) => setCsrReg({ ...csrReg, email: e.target.value })}
                    style={inputStyle}
                    placeholder="csr@company.com"
                  />
                  <Mail size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Password *</label>
                  <input type="password" required minLength={6} value={csrReg.password} onChange={(e) => setCsrReg({ ...csrReg, password: e.target.value })} style={inputPlain} />
                </div>
                <div>
                  <label style={labelStyle}>Confirm *</label>
                  <input type="password" required minLength={6} value={csrReg.confirm_password} onChange={(e) => setCsrReg({ ...csrReg, confirm_password: e.target.value })} style={inputPlain} />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: 12, fontWeight: 800, background: accent, borderColor: accent, marginTop: 4 }}>
                {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Register company'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
