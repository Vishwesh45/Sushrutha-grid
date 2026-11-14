import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const ROLES = [
  { value: 'patient', label: 'Patient' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'admin', label: 'Admin (Hospital Administration)' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'csr', label: 'CSR Representative' },
];

export default function AuthSection() {
  const { user, isAuthenticated, login, register, logout } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'patient',
    phone: '',
    department: '',
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // RBAC test states
  const [rbacResult, setRbacResult] = useState(null);
  const [rbacLoading, setRbacLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        await register(formData);
        setSuccessMsg('Registration successful! Please log in with your credentials.');
        setMode('login');
      } else {
        await login(formData.email, formData.password);
        setSuccessMsg('Login successful! Welcome back.');
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Authentication failed.';
      setErrorMsg(detail);
    } finally {
      setLoading(false);
    }
  };

  const testEndpoint = async (endpointName) => {
    setRbacLoading(true);
    setRbacResult(null);
    try {
      const res = await api.get(endpointName === 'me' ? '/auth/me' : '/auth/admin-only');
      setRbacResult({
        endpoint: endpointName === 'me' ? 'GET /api/auth/me' : 'GET /api/auth/admin-only',
        status: res.status,
        allowed: true,
        data: res.data,
      });
    } catch (err) {
      setRbacResult({
        endpoint: endpointName === 'me' ? 'GET /api/auth/me' : 'GET /api/auth/admin-only',
        status: err.response?.status || 500,
        allowed: false,
        error: err.response?.data?.detail || err.message,
      });
    } finally {
      setRbacLoading(false);
    }
  };

  return (
    <section className="card">
      <div className="auth-header">
        <h2>Phase 2: Authentication & Role-Based Access Control (RBAC)</h2>
        <p className="description">
          Secure JWT authentication with salted bcrypt hashing and real backend role enforcement.
        </p>
      </div>

      {isAuthenticated ? (
        <div className="user-profile-panel">
          <div className="profile-summary">
            <div>
              <span className="profile-name">{user.name}</span>
              <span className="profile-email">{user.email}</span>
            </div>
            <div className="profile-badges">
              <span className={`badge role-badge role-${user.role}`}>
                Role: {user.role.toUpperCase()}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                Log Out
              </button>
            </div>
          </div>

          <div className="rbac-test-section">
            <h3>Test Live Backend Role Enforcement (RBAC)</h3>
            <p className="subtext">
              Verify how the FastAPI backend guards endpoints based on the logged-in role.
            </p>

            <div className="button-group">
              <button
                className="btn btn-outline"
                onClick={() => testEndpoint('me')}
                disabled={rbacLoading}
              >
                Test Protected Route (/api/auth/me)
              </button>
              <button
                className="btn btn-outline"
                onClick={() => testEndpoint('admin')}
                disabled={rbacLoading}
              >
                Test Admin Route (/api/auth/admin-only)
              </button>
            </div>

            {rbacResult && (
              <div
                className={`rbac-feedback-box ${
                  rbacResult.allowed ? 'feedback-success' : 'feedback-denied'
                }`}
              >
                <div className="feedback-header">
                  <strong>{rbacResult.endpoint}</strong>
                  <span className={`badge ${rbacResult.allowed ? 'badge-success' : 'badge-danger'}`}>
                    Status: {rbacResult.status} {rbacResult.allowed ? 'Authorized (200 OK)' : 'Denied (403 Forbidden)'}
                  </span>
                </div>
                <pre className="code-output">
                  {JSON.stringify(rbacResult.data || { detail: rbacResult.error }, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="auth-form-container">
          <div className="tab-buttons">
            <button
              className={`tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
            >
              Sign In
            </button>
            <button
              className={`tab-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
              }}
            >
              Register New Account
            </button>
          </div>

          {errorMsg && <div className="error-alert">{errorMsg}</div>}
          {successMsg && <div className="success-alert">{successMsg}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <>
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Ramesh Kumar"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Select Role</label>
                  <select name="role" value={formData.role} onChange={handleInputChange}>
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Phone Number (Optional)</label>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="e.g. +91 9876543210"
                  />
                </div>

                {['doctor', 'nurse'].includes(formData.role) && (
                  <div className="form-group">
                    <label>Department</label>
                    <input
                      type="text"
                      name="department"
                      value={formData.department}
                      onChange={handleInputChange}
                      placeholder="e.g. General Medicine, Orthopaedics"
                    />
                  </div>
                )}
              </>
            )}

            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="name@hospital.org"
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading
                ? 'Processing...'
                : mode === 'login'
                ? 'Sign In to Sushrutha Grid'
                : 'Create Account'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
