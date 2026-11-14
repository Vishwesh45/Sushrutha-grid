import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, Clock, Building2, RefreshCw } from 'lucide-react';
import api from '../services/api';

const HOSPITAL_NAME = 'Victoria Hospital (BMCRI Apex Medical Center)';

export default function ReceptionDisplayPage() {
  const [codeData, setCodeData] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCode = useCallback(async () => {
    try {
      const res = await api.get('/reception/code/display');
      setCodeData(res.data);
      setCountdown(res.data.expires_in_seconds || 0);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load desk code.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchCode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchCode]);

  const mins = Math.floor(countdown / 60);
  const secs = String(countdown % 60).padStart(2, '0');

  return (
    <div style={{
      minHeight: 'calc(100vh - 120px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #0b1220 0%, #12263f 55%, #0f172a 100%)',
      borderRadius: 16,
      padding: '32px 20px',
      color: '#f8fafc',
      textAlign: 'center',
    }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#93c5fd', marginBottom: 10 }}>
        <Building2 size={16} /> OPD Reception Desk
      </div>
      <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 900 }}>
        {codeData?.hospital_name || HOSPITAL_NAME}
      </h1>
      <p style={{ margin: '0 0 28px', maxWidth: 520, color: '#94a3b8', fontSize: '1rem', lineHeight: 1.5 }}>
        Look at this screen. Enter the code in the Sushrutha app under <strong style={{ color: '#e2e8f0' }}>Today&apos;s visit</strong> to unlock digital check-in.
      </p>

      <div style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: 20,
        padding: '36px 28px',
        minWidth: 'min(92vw, 560px)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: '0.85rem', fontWeight: 700, marginBottom: 12 }}>
          <KeyRound size={16} /> Today&apos;s desk code
        </div>
        <div style={{
          fontSize: 'clamp(3rem, 12vw, 5.5rem)',
          fontWeight: 900,
          letterSpacing: '0.32em',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          marginLeft: '0.32em',
          lineHeight: 1.1,
        }}>
          {loading && !codeData ? '······' : (codeData?.code || '—')}
        </div>
        <div style={{
          marginTop: 18,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(15,23,42,0.55)',
          padding: '8px 16px',
          borderRadius: 999,
          fontSize: '0.95rem',
        }}>
          <Clock size={16} />
          {countdown > 0 ? `Expires in ${mins}:${secs}` : 'Refreshing…'}
        </div>
      </div>

      {error && (
        <p style={{ marginTop: 16, color: '#fca5a5' }}>{error}</p>
      )}

      <button
        type="button"
        onClick={fetchCode}
        style={{
          marginTop: 22,
          background: 'transparent',
          border: '1px solid rgba(148,163,184,0.35)',
          color: '#cbd5e1',
          borderRadius: 8,
          padding: '8px 14px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '0.85rem',
        }}
      >
        <RefreshCw size={14} /> Refresh board
      </button>
    </div>
  );
}
