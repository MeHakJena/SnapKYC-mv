import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, store, fmtTime } from '../lib/api.js';

// <video> that shows a MediaStream (React can't set srcObject as a prop).
export function StreamVideo({ stream, muted = false, mirrored = false, videoRef, className = '' }) {
  const innerRef = useRef(null);
  const ref = videoRef || innerRef;
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream, ref]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={`${className} ${mirrored ? 'mirrored' : ''}`} />;
}

export function QrImage({ text }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(text, { width: 260, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc(''));
  }, [text]);
  return src ? <img src={src} alt="QR code linking to the token check page" className="qr" /> : null;
}

export function ErrorBox({ error }) {
  return error ? <div className="alert alert-error">{error}</div> : null;
}

const STATUS_LABELS = {
  consented: 'Consented',
  waiting: 'Waiting for agent',
  in_call: 'In call',
  recommended: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
};
export const StatusBadge = ({ status }) => <span className={`badge badge-${status}`}>{STATUS_LABELS[status] || status}</span>;

const ACTION_LABELS = {
  consent_given: 'Consent given',
  location_captured: 'Location captured',
  snapkyc_verified: 'Mock SnapKYC verified',
  call_claimed: 'Agent picked up the call',
  call_released: 'Call returned to queue',
  snapshot_taken: 'Face snapshot taken',
  recording_saved: 'Recording saved',
  questions_asked: 'Questions asked',
  recommend_approve: 'Agent recommended APPROVE',
  recommend_reject: 'Agent recommended REJECT',
  recording_viewed: 'Reviewer played the recording',
  decision_blocked: 'Decision blocked by server',
  approved: 'Reviewer APPROVED',
  rejected: 'Reviewer REJECTED',
  token_issued: 'KYC token issued',
};

// The audit trail: every step with who did it and when.
export function Timeline({ events }) {
  if (!events?.length) return null;
  return (
    <ol className="timeline">
      {events.map((e, i) => {
        const detail = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
        return (
          <li key={i} className={e.action === 'decision_blocked' ? 'blocked' : ''}>
            <div className="tl-time">{fmtTime(e.created_at)}</div>
            <div>
              <strong>{ACTION_LABELS[e.action] || e.action}</strong>{' '}
              <span className="muted">by {e.actor_id || e.actor_type}</span>
              {detail?.reason && <div className="muted small">{detail.reason}</div>}
              {detail?.note && <div className="muted small">Note: {detail.note}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Login form for staff pages. Keeps the login per browser tab.
export function useStaffLogin(role) {
  const key = `snapkyc_staff_${role}`;
  const [auth, setAuth] = useState(() => store.get(key));
  const valid = auth && auth.user?.roles?.includes(role);
  return {
    auth: valid ? auth : null,
    login: (a) => {
      store.set(key, a);
      setAuth(a);
    },
    logout: () => {
      store.remove(key);
      setAuth(null);
    },
  };
}

export function LoginForm({ role, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/auth/demo-users').then((all) => setUsers(all.filter((u) => u.roles.includes(role)))).catch(() => {});
  }, [role]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      if (!result.user.roles.includes(role)) throw new Error(`${result.user.id} does not have the ${role} role`);
      onLogin(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h2>{role === 'agent' ? 'Agent login' : 'Reviewer login'}</h2>
      <form onSubmit={submit} className="stack">
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy || !username || !password}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      {users.length > 0 && (
        <p className="muted small">
          Demo users: {users.map((u) => <code key={u.id} className="pill" onClick={() => setUsername(u.id)}>{u.id}</code>)}{' '}
          · password is in the README
        </p>
      )}
    </div>
  );
}

export function StaffBar({ auth, onLogout }) {
  return (
    <div className="staffbar">
      <span>
        Logged in as <strong>{auth.user.name}</strong> <code>{auth.user.id}</code>
      </span>
      <button className="btn link" onClick={onLogout}>Log out</button>
    </div>
  );
}
