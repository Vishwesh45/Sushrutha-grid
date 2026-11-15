import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, User, Phone, Mail, Lock, KeyRound, AlertCircle,
  CheckCircle2, ArrowRight, ShieldCheck, HeartPulse, RefreshCw,
  Stethoscope, Shield, UserRound
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const ROLES = [
  { id: 'patient', label: 'Patient', subtitle: 'OPD & records', icon: UserRound, accent: '#2563eb', soft: '#eff6ff' },
  { id: 'doctor', label: 'Doctor', subtitle: 'Clinical desk', icon: Stethoscope, accent: '#059669', soft: '#ecfdf5' },
  { id: 'admin', label: 'Admin', subtitle: 'Hospital ops', icon: Shield, accent: '#b45309', soft: '#fffbeb' },
];

const DEMO = {
  patient: { identifier: '', password: '' },
  doctor: { identifier: 'dr.sneha.med@sushrutha.gov.in', password: 'Doctor@Sushrutha2026!' },
  admin: { identifier: 'admin@sushrutha.gov.in', password: 'Admin@Sushrutha2026!' },
};

export default function UnifiedAuthModal({
  isOpen,
  onClose,
  onSuccess,
  initialRole = 'patient',
  initialView = 'login',
}) {
  const {
    login,
    loginPatient,
    registerPatient,
    requestPasswordReset,
    confirmPasswordReset,
    logout,
  } = useAuth();

  const [role, setRole] = useState(initialRole);
  const [view, setView] = useState(initialView);
  const [loginData, setLoginData] = useState({ identifier: '', password: '' });
  const [registerData, setRegisterData] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
    confirm_password: '',
    age: '',
    gender: 'Male',
    address: '',
  });
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetData, setResetData] = useState({ otp: '', new_password: '', confirm_password: '' });
  const [rosterQuickList, setRosterQuickList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const activeMeta = ROLES.find((r) => r.id === role) || ROLES[0];
  const RoleIcon = activeMeta.icon;

  useEffect(() => {
    if (!isOpen) return;
    const next = ['patient', 'doctor', 'admin'].includes(initialRole) ? initialRole : 'patient';
    setRole(next);
    setView(initialView === 'register' && next === 'patient' ? 'register' : 'login');
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoginData({ identifier: '', password: '' });
  }, [isOpen, initialRole, initialView]);

  useEffect(() => {
    if (!isOpen || role !== 'doctor') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/doctor-desk/roster-quick-list');
        if (!cancelled && res.data?.doctors) setRosterQuickList(res.data.doctors);
      } catch { /* optional */ }
    })();
    return () => { cancelled = true; };
  }, [isOpen, role]);

  if (!isOpen) return null;

  const resetAlerts = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const switchRole = (nextRole) => {
    resetAlerts();
    setRole(nextRole);
    setView('login');
    setLoginData({ identifier: '', password: '' });
  };

  const finishSuccess = (msg, signedRole = role) => {
    setSuccessMsg(msg);
    if (onSuccess) onSuccess(signedRole);
    setTimeout(() => onClose(), 500);
  };

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  const isValidIndianMobile = (value) => /^[6-9]\d{9}$/.test(String(value || '').replace(/\D/g, '').slice(-10));
  const apiDetail = (err, fallback) => {
    const d = err?.response?.data?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
    return fallback;
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    resetAlerts();
    const ident = loginData.identifier.trim();
    const password = loginData.password;
    if (!ident) {
      setErrorMsg(role === 'patient' ? 'Enter your mobile number or email.' : 'Enter your email.');
      return;
    }
    if (!password) {
      setErrorMsg('Password is required.');
      return;
    }
    if (role === 'patient') {
      const digits = ident.replace(/\D/g, '');
      const looksPhone = digits.length >= 10 && ident.replace(/[\s+\-]/g, '').replace(/\D/g, '').length >= 10;
      if (!looksPhone && !isValidEmail(ident)) {
        setErrorMsg('Enter a valid 10-digit mobile or email address.');
        return;
      }
    } else if (!isValidEmail(ident)) {
      setErrorMsg('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      if (role === 'patient') {
        await loginPatient(ident, password);
        finishSuccess('Signed in.', 'patient');
        return;
      }
      const email = ident.toLowerCase();
      const data = await login(email, password);
      if (role === 'doctor' && data.role !== 'doctor' && data.role !== 'admin') {
        await logout(true);
        setErrorMsg(`This account is '${data.role}'. Use Doctor credentials.`);
        return;
      }
      if (role === 'admin' && data.role !== 'admin') {
        await logout(true);
        setErrorMsg(`This account is '${data.role}'. Administrator credentials required.`);
        return;
      }
      finishSuccess('Signed in.', data.role === 'admin' ? 'admin' : role);
    } catch (err) {
      setErrorMsg(apiDetail(err, 'Invalid credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    resetAlerts();
    if (role !== 'patient') {
      setErrorMsg('Only patients can register here.');
      return;
    }
    const fullName = registerData.full_name.trim();
    const email = registerData.email.trim().toLowerCase();
    const cleanPhone = registerData.phone.replace(/\D/g, '').slice(-10);
    if (fullName.length < 2) {
      setErrorMsg('Enter your full name (at least 2 characters).');
      return;
    }
    if (!isValidIndianMobile(cleanPhone)) {
      setErrorMsg('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!isValidEmail(email)) {
      setErrorMsg('Enter a valid email address.');
      return;
    }
    if (!registerData.password || registerData.password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (registerData.password !== registerData.confirm_password) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (registerData.age !== '' && registerData.age != null) {
      const ageNum = parseInt(registerData.age, 10);
      if (Number.isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
        setErrorMsg('Age must be between 1 and 120.');
        return;
      }
    }
    setLoading(true);
    try {
      await registerPatient({
        full_name: fullName,
        phone: cleanPhone,
        email,
        password: registerData.password,
        age: registerData.age ? parseInt(registerData.age, 10) : null,
        gender: registerData.gender,
        address: registerData.address,
      });
      finishSuccess('Account created.', 'patient');
    } catch (err) {
      setErrorMsg(apiDetail(err, 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    resetAlerts();
    const email = forgotEmail.trim().toLowerCase();
    if (!email) {
      setErrorMsg('Email is required.');
      return;
    }
    if (!isValidEmail(email)) {
      setErrorMsg('Enter a valid email address.');
      return;
    }
    setForgotEmail(email);
    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      setSuccessMsg(res?.message || `Reset code sent to ${email}. Check inbox and spam.`);
      setResetData({ otp: '', new_password: '', confirm_password: '' });
      setView('reset_otp');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setErrorMsg(
        typeof detail === 'string'
          ? detail
          : 'Could not send reset code. Use the email from signup.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    resetAlerts();
    if (!/^\d{6}$/.test(resetData.otp)) {
      setErrorMsg('Enter the 6-digit code from your email.');
      return;
    }
    if (!resetData.new_password || resetData.new_password.length < 6) {
      setErrorMsg('New password must be at least 6 characters.');
      return;
    }
    if (resetData.new_password !== resetData.confirm_password) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(forgotEmail, resetData.otp, resetData.new_password);
      setSuccessMsg('Password updated. Sign in with your new password.');
      setView('login');
      setLoginData((prev) => ({ ...prev, identifier: forgotEmail, password: '' }));
      setResetData({ otp: '', new_password: '', confirm_password: '' });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setErrorMsg(typeof detail === 'string' ? detail : 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle = {
    width: '100%',
    padding: '10px 12px 10px 38px',
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    fontSize: 14,
    boxSizing: 'border-box',
    background: '#fff',
  };
  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#334155',
    marginBottom: 6,
  };

  return createPortal(
    <div className="auth-modal-overlay" style={{ zIndex: 9999 }} role="dialog" aria-modal="true">
      <div className="auth-modal-card" style={{ padding: 0, maxWidth: 480 }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: activeMeta.soft }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: activeMeta.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HeartPulse size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Sushrutha Grid</h3>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Patient · Doctor · Admin</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: 6 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '20px 22px 22px' }}>
          <div className="auth-role-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16, padding: 4, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            {ROLES.map((r) => {
              const Icon = r.icon;
              const active = role === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => switchRole(r.id)}
                  style={{
                    border: active ? `1.5px solid ${r.accent}` : '1.5px solid transparent',
                    background: active ? '#fff' : 'transparent',
                    borderRadius: 10,
                    padding: '10px 6px',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <Icon size={16} style={{ color: active ? r.accent : '#94a3b8' }} />
                  <div style={{ fontSize: 12, fontWeight: 800, color: active ? '#0f172a' : '#64748b', marginTop: 2 }}>{r.label}</div>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <RoleIcon size={16} style={{ color: activeMeta.accent }} />
            <strong style={{ fontSize: 14, color: '#0f172a' }}>
              {view === 'register' ? 'Create patient account' : view === 'forgot' || view === 'reset_otp' ? 'Reset password' : `${activeMeta.label} sign in`}
            </strong>
          </div>

          {errorMsg && (
            <div className="status-alert alert-error" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertCircle size={16} /><span style={{ fontSize: 13 }}>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 8, padding: '10px 12px' }}>
              <CheckCircle2 size={16} /><span style={{ fontSize: 13 }}>{successMsg}</span>
            </div>
          )}

          {view === 'login' && (
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
              {role === 'doctor' && rosterQuickList.length > 0 && (
                <select
                  value={loginData.identifier}
                  onChange={(e) => { setLoginData({ identifier: e.target.value, password: DEMO.doctor.password }); resetAlerts(); }}
                  style={{ ...fieldStyle, paddingLeft: 12 }}
                >
                  <option value="">Select doctor</option>
                  {rosterQuickList.map((doc) => (
                    <option key={doc.doctor_id} value={doc.email}>{doc.name} · {doc.department}</option>
                  ))}
                </select>
              )}
              {(role === 'doctor' || role === 'admin') && (
                <button
                  type="button"
                  onClick={() => { setLoginData({ ...DEMO[role] }); resetAlerts(); }}
                  style={{ width: '100%', background: activeMeta.soft, border: `1.5px dashed ${activeMeta.accent}`, color: activeMeta.accent, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                >
                  <KeyRound size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Autofill demo
                </button>
              )}
              <div>
                <label style={labelStyle}>{role === 'patient' ? 'Mobile or email *' : 'Email *'}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={role === 'patient' ? 'text' : 'email'}
                    required
                    autoComplete={role === 'patient' ? 'username' : 'email'}
                    value={loginData.identifier}
                    onChange={(e) => { setLoginData({ ...loginData, identifier: e.target.value }); resetAlerts(); }}
                    style={fieldStyle}
                    placeholder={role === 'patient' ? '9876543210 or name@mail.com' : 'name@email.com'}
                  />
                  {role === 'patient'
                    ? <Phone size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                    : <Mail size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Password *</label>
                  {role === 'patient' && (
                    <button type="button" onClick={() => { resetAlerts(); setView('forgot'); }} style={{ background: 'none', border: 'none', color: activeMeta.accent, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Forgot?</button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={loginData.password}
                    onChange={(e) => { setLoginData({ ...loginData, password: e.target.value }); resetAlerts(); }}
                    style={fieldStyle}
                  />
                  <Lock size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <button type="submit" disabled={loading || !loginData.identifier.trim() || !loginData.password} className="btn btn-primary" style={{ width: '100%', padding: 12, fontWeight: 800, background: activeMeta.accent, borderColor: activeMeta.accent }}>
                {loading ? <RefreshCw className="animate-spin" size={18} /> : <>Sign in <ArrowRight size={16} /></>}
              </button>
              {role === 'patient' && (
                <p style={{ textAlign: 'center', margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  New patient?{' '}
                  <button type="button" onClick={() => { resetAlerts(); setView('register'); }} style={{ background: 'none', border: 'none', color: activeMeta.accent, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    Register
                  </button>
                </p>
              )}
            </form>
          )}

          {view === 'register' && role === 'patient' && (
            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }} noValidate>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                Use a real mobile and email — needed for follow-up reminders and password reset.
              </p>
              <div>
                <label style={labelStyle}>Full name *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    required
                    autoComplete="name"
                    value={registerData.full_name}
                    onChange={(e) => { setRegisterData({ ...registerData, full_name: e.target.value }); resetAlerts(); }}
                    style={fieldStyle}
                    placeholder="As on Aadhaar / ID"
                  />
                  <User size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                </div>
              </div>
              <div className="auth-field-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Mobile *</label>
                  <input
                    type="tel"
                    required
                    inputMode="numeric"
                    maxLength={10}
                    autoComplete="tel"
                    value={registerData.phone}
                    onChange={(e) => {
                      setRegisterData({ ...registerData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) });
                      resetAlerts();
                    }}
                    placeholder="9876543210"
                    style={{ ...fieldStyle, paddingLeft: 12 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={registerData.email}
                    onChange={(e) => { setRegisterData({ ...registerData, email: e.target.value }); resetAlerts(); }}
                    placeholder="name@mail.com"
                    style={{ ...fieldStyle, paddingLeft: 12 }}
                  />
                </div>
              </div>
              <div className="auth-field-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Age</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={registerData.age}
                    onChange={(e) => { setRegisterData({ ...registerData, age: e.target.value }); resetAlerts(); }}
                    style={{ ...fieldStyle, paddingLeft: 12 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Gender</label>
                  <select
                    value={registerData.gender}
                    onChange={(e) => setRegisterData({ ...registerData, gender: e.target.value })}
                    style={{ ...fieldStyle, paddingLeft: 12 }}
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <div className="auth-field-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Password * (min 6)</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={registerData.password}
                    onChange={(e) => { setRegisterData({ ...registerData, password: e.target.value }); resetAlerts(); }}
                    style={{ ...fieldStyle, paddingLeft: 12 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Confirm *</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={registerData.confirm_password}
                    onChange={(e) => { setRegisterData({ ...registerData, confirm_password: e.target.value }); resetAlerts(); }}
                    style={{ ...fieldStyle, paddingLeft: 12 }}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !registerData.full_name.trim() || !registerData.phone || !registerData.email.trim() || !registerData.password}
                className="btn btn-primary"
                style={{ width: '100%', padding: 12, fontWeight: 800, background: '#059669', borderColor: '#059669', marginTop: 4 }}
              >
                {loading ? <RefreshCw className="animate-spin" size={18} /> : <>Create account <ShieldCheck size={16} /></>}
              </button>
              <p style={{ textAlign: 'center', margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                Already registered?{' '}
                <button type="button" onClick={() => { resetAlerts(); setView('login'); }} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                  Sign in
                </button>
              </p>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
                Enter the <strong>exact email used at signup</strong>. Wrong or unregistered emails are rejected immediately.
              </p>
              <div>
                <label style={labelStyle}>Registered email *</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => { setForgotEmail(e.target.value); resetAlerts(); }}
                  placeholder="name@email.com"
                  style={{ ...fieldStyle, paddingLeft: 12 }}
                />
              </div>
              {loading && (
                <p style={{ margin: 0, fontSize: 12, color: '#0369a1', lineHeight: 1.4 }}>
                  Sending via mail server (usually a few seconds)…
                </p>
              )}
              <button type="submit" disabled={loading || !forgotEmail.trim()} className="btn btn-primary" style={{ width: '100%', padding: 12, fontWeight: 800 }}>
                {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Send code'}
              </button>
              <button type="button" onClick={() => { resetAlerts(); setView('login'); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>← Back to sign in</button>
            </form>
          )}

          {view === 'reset_otp' && (
            <form onSubmit={handleResetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }} noValidate>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
                Code sent to <strong>{forgotEmail}</strong>. Use the <strong>newest</strong> email only
                (older codes are cancelled). Expires in 15 minutes. Check spam if needed.
              </p>
              <div>
                <label style={labelStyle}>6-digit code *</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={resetData.otp}
                  onChange={(e) => setResetData({ ...resetData, otp: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  placeholder="______"
                  style={{ ...fieldStyle, paddingLeft: 12, textAlign: 'center', letterSpacing: 4, fontWeight: 700 }}
                />
              </div>
              <div>
                <label style={labelStyle}>New password * (min 6)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={resetData.new_password}
                  onChange={(e) => setResetData({ ...resetData, new_password: e.target.value })}
                  placeholder="New password"
                  style={{ ...fieldStyle, paddingLeft: 12 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Confirm password *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={resetData.confirm_password}
                  onChange={(e) => setResetData({ ...resetData, confirm_password: e.target.value })}
                  placeholder="Confirm password"
                  style={{ ...fieldStyle, paddingLeft: 12 }}
                />
              </div>
              <button
                type="submit"
                disabled={loading || resetData.otp.length !== 6 || !resetData.new_password}
                className="btn btn-primary"
                style={{ width: '100%', padding: 12, fontWeight: 800 }}
              >
                {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Reset password'}
              </button>
              <button type="button" onClick={() => { resetAlerts(); setView('forgot'); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                Resend code / change email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
