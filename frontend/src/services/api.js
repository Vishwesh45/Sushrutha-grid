import axios from 'axios';

// Base API instance for Sushrutha Grid backend (uses 127.0.0.1 to avoid Windows IPv6 ::1 resolution delays)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach JWT token if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sushrutha_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Expired / revoked session → clear local auth so UI returns to guest portals
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const url = String(err?.config?.url || '');
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/patient/login') || url.includes('/auth/patient/register');
    if (status === 401 && !isAuthCall && localStorage.getItem('sushrutha_token')) {
      localStorage.removeItem('sushrutha_token');
      localStorage.removeItem('sushrutha_session');
      localStorage.setItem('sushrutha_logout_event', Date.now().toString());
      if (!window.location.pathname.startsWith('/lobby') && !window.location.pathname.startsWith('/reception')) {
        // Soft redirect — AuthContext storage listener clears React state in other tabs;
        // this tab reloads guest chrome without a hard full-page flash when already on home.
        if (window.location.pathname !== '/') {
          window.location.assign('/');
        } else {
          window.location.reload();
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
