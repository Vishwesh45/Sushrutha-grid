import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Tv, Users, RefreshCw, ExternalLink } from 'lucide-react';
import api from '../services/api';
import { useHospitalWebSocket } from '../services/useHospitalWebSocket';

const HOSPITAL_ID = 'HOSP-BLR-001';
const HOSPITAL_NAME = 'Victoria Hospital (BMCRI Apex Medical Center)';

/** Reception desk code only (Home page + Patient "Desk code" tab). */
export function ReceptionDeskCodePanel({ compact = false, showLinks = true }) {
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
      setError(err.response?.data?.detail || 'Desk code unavailable');
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
  const displayCode = codeData?.code || '····';

  return (
    <section className={`live-op-desk live-op-desk-code-only ${compact ? 'compact' : ''}`}>
      <div className="live-op-desk-head">
        <div>
          <div className="live-op-eyebrow">OPD Reception · Operational desk</div>
          <h3 className="live-op-title">{HOSPITAL_NAME}</h3>
          <p className="live-op-lead">
            Live rotating desk code for Victoria check-in. Enter it under Consult to unlock today&apos;s visit.
          </p>
        </div>
        <div className="live-op-head-actions">
          <button type="button" className="btn btn-outline" onClick={fetchCode} title="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
          {showLinks && (
            <Link to="/reception-display" className="btn btn-primary">
              <KeyRound size={14} /> Full desk TV
            </Link>
          )}
        </div>
      </div>

      <div className="live-op-code-card live-op-code-card-wide">
        <div className="live-op-code-label">
          <KeyRound size={14} /> Today&apos;s desk code
        </div>
        {error && !codeData ? (
          <div className="live-op-code-error">{error}</div>
        ) : (
          <>
            <div className="live-op-code-value">{loading && !codeData ? '…' : displayCode}</div>
            <div className="live-op-code-meta">Rotates in {mins}:{secs}</div>
            <p className="live-op-code-hint">
              Same code as the physical reception board at Victoria ({HOSPITAL_ID}).
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/** Department-specific live OPD who's next (Patient "Live OPD" tab only). */
export function LiveOpdWhosNextPanel({ compact = false, showLinks = true }) {
  const [tokens, setTokens] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    try {
      const [queueRes, docsRes] = await Promise.all([
        api.get(`/queue/live?hospital_id=${HOSPITAL_ID}`),
        api.get(`/doctors/?hospital_id=${HOSPITAL_ID}`),
      ]);
      const list = Array.isArray(queueRes.data) ? queueRes.data : (queueRes.data?.tokens || []);
      setTokens(list);
      const depts = Array.from(
        new Set([
          ...list.map((t) => t.department).filter(Boolean),
          ...((docsRes.data?.data || []).map((d) => d.department).filter(Boolean)),
        ])
      ).sort();
      setDepartments(depts);
    } catch {
      /* keep last snapshot */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const q = setInterval(fetchQueue, 10000);
    return () => clearInterval(q);
  }, [fetchQueue]);

  useHospitalWebSocket((payload) => {
    const { event, data } = payload || {};
    if (data?.hospital_id && data.hospital_id !== HOSPITAL_ID) return;
    if (
      event === 'TOKEN_ISSUED' ||
      event === 'TOKEN_CALLED' ||
      event === 'CONSULTATION_STARTED' ||
      event === 'CONSULTATION_COMPLETED' ||
      event === 'PATIENT_SKIPPED' ||
      event === 'TOKEN_REJOINED'
    ) {
      fetchQueue();
    }
  });

  const waiting = useMemo(() => {
    const list = tokens.filter((t) => String(t.status || '').toUpperCase() === 'WAITING');
    const filtered = deptFilter === 'ALL' ? list : list.filter((t) => t.department === deptFilter);
    return [...filtered].sort((a, b) => {
      const pr = (a.priority_rank ?? 99) - (b.priority_rank ?? 99);
      if (pr !== 0) return pr;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }, [tokens, deptFilter]);

  const called = useMemo(() => {
    const list = tokens.filter((t) => String(t.status || '').toUpperCase() === 'CALLED');
    return deptFilter === 'ALL' ? list : list.filter((t) => t.department === deptFilter);
  }, [tokens, deptFilter]);

  return (
    <section className={`live-op-desk live-op-desk-queue-only ${compact ? 'compact' : ''}`}>
      <div className="live-op-desk-head">
        <div>
          <div className="live-op-eyebrow">Live OPD · department queue</div>
          <h3 className="live-op-title">Who&apos;s next at {HOSPITAL_NAME}</h3>
          <p className="live-op-lead">
            Filter by department to see the next waiting tokens and any token currently being called.
          </p>
        </div>
        <div className="live-op-head-actions">
          <button type="button" className="btn btn-outline" onClick={fetchQueue} title="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
          {showLinks && (
            <Link to="/lobby-display" className="btn btn-primary">
              <Tv size={14} /> Lobby TV
            </Link>
          )}
        </div>
      </div>

      <div className="live-op-queue-card live-op-queue-card-wide">
        <div className="live-op-queue-toolbar">
          <div className="live-op-code-label">
            <Users size={14} /> Department filter
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="ALL">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {called[0] && (
          <div className="live-op-now">
            <span className="live-op-now-badge">Now calling</span>
            <strong className="live-op-now-token">{called[0].token_number}</strong>
            <span className="live-op-now-dept">
              {called[0].department || 'OPD'}
              {called[0].assigned_room ? ` · ${called[0].assigned_room}` : ''}
            </span>
          </div>
        )}

        {waiting.length === 0 ? (
          <p className="live-op-empty">
            {loading ? 'Loading live queue…' : 'No waiting tokens in this department right now.'}
          </p>
        ) : (
          <ol className="live-op-waiting-list">
            {waiting.slice(0, compact ? 6 : 12).map((t, idx) => (
              <li key={t.token_id || `${t.token_number}-${idx}`}>
                <span className="live-op-pos">{idx === 0 ? 'Next' : `#${idx + 1}`}</span>
                <span className="live-op-tok">{t.token_number}</span>
                <span className="live-op-dept-line">
                  {t.department || 'OPD'}
                  {t.priority ? ` · ${t.priority}` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="live-op-queue-foot">
          {waiting.length} waiting{deptFilter !== 'ALL' ? ` in ${deptFilter}` : ''}
          {showLinks && (
            <Link to="/lobby-display" className="live-op-more">
              Full lobby board <ExternalLink size={12} />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** @deprecated Prefer ReceptionDeskCodePanel / LiveOpdWhosNextPanel */
export default function LiveOperationalDesk({ mode = 'code', ...rest }) {
  if (mode === 'queue') return <LiveOpdWhosNextPanel {...rest} />;
  return <ReceptionDeskCodePanel {...rest} />;
}
