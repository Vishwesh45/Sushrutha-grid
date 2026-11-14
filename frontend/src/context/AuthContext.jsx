import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

/**
 * ============================================================================
 * AUTHENTICATION & SESSION PROVIDER (Clean & Beginner-Friendly)
 * ============================================================================
 * 
 * Features included:
 * 1. Persistent Login via JWT (stored in localStorage)
 * 2. Hospital Session Tracking (Session ID, Login Timestamp, Expiration)
 * 3. Inactivity Heartbeat (Pings backend every 2 minutes when user interacts)
 * 4. Auto-Logout on Idle Expiry (30 mins for staff, 60 mins for patients)
 * 5. Cross-Tab Synchronization (Logging out in Tab A instantly logs out Tab B)
 * 6. Audit Logging (Backend records session start and termination events)
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('sushrutha_token'));
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem('sushrutha_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [sessionMinutesLeft, setSessionMinutesLeft] = useState(null);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [loading, setLoading] = useState(true);

  // References for tracking last user interaction without triggering rerenders
  const lastInteractionRef = useRef(Date.now());
  const lastHeartbeatRef = useRef(Date.now());

  // -------------------------------------------------------------
  // HELPER: Save session details to state & localStorage
  // -------------------------------------------------------------
  const saveSession = (sessionData) => {
    if (!sessionData) {
      localStorage.removeItem('sushrutha_session');
      setSession(null);
      setSessionMinutesLeft(null);
      setSessionWarning(false);
      return;
    }
    const normalized = {
      sessionId: sessionData.session_id || sessionData.sessionId,
      expiresAt: sessionData.expires_at || sessionData.expiresAt,
      idleTimeoutMinutes: sessionData.idle_timeout_minutes || sessionData.idleTimeoutMinutes || 30,
      role: sessionData.role || user?.role,
      loginAt: sessionData.login_at || sessionData.loginAt || new Date().toISOString()
    };
    localStorage.setItem('sushrutha_session', JSON.stringify(normalized));
    setSession(normalized);
  };

  const clearLocalAuth = useCallback(() => {
    localStorage.removeItem('sushrutha_token');
    localStorage.removeItem('sushrutha_session');
    setToken(null);
    setUser(null);
    setSession(null);
    setSessionMinutesLeft(null);
    setSessionWarning(false);
  }, []);

  // -------------------------------------------------------------
  // LOGOUT (Terminates session on server and cleans local state)
  // -------------------------------------------------------------
  const logout = useCallback(async (notifyServer = true, reason = '') => {
    if (notifyServer && token) {
      try {
        await api.post('/auth/session/logout');
      } catch (err) {
        // Silently continue if network fails during logout
        console.warn('Backend session logout notice:', err?.message || err);
      }
    }

    // Broadcast logout to other open browser tabs
    localStorage.setItem('sushrutha_logout_event', Date.now().toString());
    clearLocalAuth();

    if (reason) {
      alert(reason);
    }
  }, [token, clearLocalAuth]);

  // -------------------------------------------------------------
  // HEARTBEAT: Ping server to refresh session expiry
  // -------------------------------------------------------------
  const refreshHeartbeat = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.post('/auth/session/heartbeat');
      if (res.data?.success) {
        lastHeartbeatRef.current = Date.now();
        setSession((prev) => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            expiresAt: res.data.expires_at,
            lastActivityAt: res.data.last_activity_at
          };
          localStorage.setItem('sushrutha_session', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) {
      console.warn('Heartbeat error:', err?.message || err);
    }
  }, [token]);

  // -------------------------------------------------------------
  // INITIALIZE AUTH: Load profile & verify active session
  // -------------------------------------------------------------
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('sushrutha_token');
      if (storedToken) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data);

          // Fetch active session info from backend
          try {
            const sessRes = await api.get('/auth/session/active');
            if (sessRes.data?.session_id) {
              saveSession(sessRes.data);
            }
          } catch (sessErr) {
            console.warn('Active session fetch note:', sessErr?.message || sessErr);
          }
        } catch (err) {
          console.warn('Session expired or invalid token:', err);
          logout(false);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [logout]);

  // -------------------------------------------------------------
  // USER ACTIVITY LISTENER: Record user actions (mouse, keys)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    const handleUserActivity = () => {
      lastInteractionRef.current = Date.now();

      // If more than 2 minutes have passed since last server heartbeat, send one now
      const timeSinceHeartbeat = Date.now() - lastHeartbeatRef.current;
      if (timeSinceHeartbeat > 2 * 60 * 1000) {
        refreshHeartbeat();
      }
    };

    // Listen to standard browser interaction events
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('scroll', handleUserActivity);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('scroll', handleUserActivity);
    };
  }, [user, refreshHeartbeat]);

  // -------------------------------------------------------------
  // SESSION COUNTDOWN & TIMEOUT CHECKER (Runs every 10 seconds)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!user || !session?.expiresAt) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const expiry = new Date(session.expiresAt).getTime();
      const diffMs = expiry - now;

      if (diffMs <= 0) {
        // Session has expired
        logout(true, 'Your clinical session has timed out due to inactivity to protect patient records. Please log in again.');
      } else {
        const minutesLeft = Math.ceil(diffMs / 60000);
        setSessionMinutesLeft(minutesLeft);

        // Show warning if 3 minutes or less remain
        if (minutesLeft <= 3 && !sessionWarning) {
          setSessionWarning(true);
        } else if (minutesLeft > 3 && sessionWarning) {
          setSessionWarning(false);
        }
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(timer);
  }, [user, session, logout, sessionWarning]);

  // -------------------------------------------------------------
  // CROSS-TAB SYNC: logout / login in another tab mirrors here
  // -------------------------------------------------------------
  useEffect(() => {
    const handleStorageChange = async (e) => {
      if (e.key === 'sushrutha_logout_event' || (e.key === 'sushrutha_token' && !e.newValue)) {
        setToken(null);
        setUser(null);
        setSession(null);
        setSessionMinutesLeft(null);
        setSessionWarning(false);
        return;
      }
      if (e.key === 'sushrutha_login_event' || (e.key === 'sushrutha_token' && e.newValue)) {
        const storedToken = localStorage.getItem('sushrutha_token');
        if (!storedToken) return;
        try {
          setToken(storedToken);
          const res = await api.get('/auth/me');
          setUser(res.data);
          const sessRes = await api.get('/auth/session/active');
          if (sessRes.data?.session_id) saveSession(sessRes.data);
        } catch {
          clearLocalAuth();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const applyAuthPayload = (data, idleMinutes) => {
    const { access_token, user_id, name, role, phone, uhid, session_id } = data;
    localStorage.setItem('sushrutha_token', access_token);
    localStorage.setItem('sushrutha_login_event', Date.now().toString());
    setToken(access_token);
    setUser({
      id: user_id,
      name,
      email: data.email,
      role,
      phone,
      uhid,
    });
    if (session_id) {
      saveSession({
        session_id,
        role,
        expires_at: new Date(Date.now() + idleMinutes * 60000).toISOString(),
        idle_timeout_minutes: idleMinutes,
      });
    }
  };

  // -------------------------------------------------------------
  // LOGIN METHODS (Doctor / Staff / Admin)
  // -------------------------------------------------------------
  const login = async (email, password) => {
    if (token) {
      try { await api.post('/auth/session/logout'); } catch { /* ignore */ }
      clearLocalAuth();
    }
    const res = await api.post('/auth/login', { email, password });
    applyAuthPayload(res.data, 30);
    return res.data;
  };

  // -------------------------------------------------------------
  // PATIENT LOGIN
  // -------------------------------------------------------------
  const loginPatient = async (identifier, password) => {
    if (token) {
      try { await api.post('/auth/session/logout'); } catch { /* ignore */ }
      clearLocalAuth();
    }
    const res = await api.post('/auth/patient/login', { identifier, password });
    applyAuthPayload(res.data, 60);
    return res.data;
  };

  // -------------------------------------------------------------
  // PATIENT REGISTRATION
  // -------------------------------------------------------------
  const registerPatient = async (patientData) => {
    if (token) {
      try { await api.post('/auth/session/logout'); } catch { /* ignore */ }
      clearLocalAuth();
    }
    const res = await api.post('/auth/patient/register', patientData);
    applyAuthPayload(res.data, 60);
    return res.data;
  };

  // Password reset helper methods
  const requestPasswordReset = async (email) => {
    const res = await api.post('/auth/forgot-password', { email });
    return res.data;
  };

  const confirmPasswordReset = async (email, otp, new_password) => {
    const res = await api.post('/auth/reset-password', { email, otp, new_password });
    return res.data;
  };

  const register = async (userData) => {
    const res = await api.post('/auth/register', userData);
    return res.data;
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      session,
      sessionMinutesLeft,
      sessionWarning,
      refreshHeartbeat,
      isAuthenticated: !!user,
      loading,
      login,
      loginPatient,
      registerPatient,
      requestPasswordReset,
      confirmPasswordReset,
      register,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
