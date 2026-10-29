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
  customer_left: 'Customer left the call',
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
              {detail?.place && <div className="muted small">{detail.place}</div>}
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

// SVG Icons for Video Call Controls
export function IconMic({ className = "call-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

export function IconMicOff({ className = "call-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

export function IconVideo({ className = "call-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

export function IconVideoOff({ className = "call-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 17l-5-3.5V7a2 2 0 0 0-2-2H7.82M3 3l18 18" />
      <path d="M1 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.4-0.6L2.4 3.6" />
    </svg>
  );
}

export function IconPhoneOff({ className = "call-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

export function IconPhoneCall({ className = "call-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export function IconCamera({ className = "call-icon" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

// Floating In-Call Controls Toolbar for Mute, Camera, Snapshot, and Hangup
export function CallControlsBar({
  isMuted,
  onToggleMute,
  isVideoOff,
  onToggleVideo,
  onHangUp,
  hangUpLabel = 'Cut Call',
  hangUpDisabled = false,
  isAgent = false,
  onTakeSnapshot,
  snapshotUrl,
  busySnapshot = false,
  snapshotDisabled = false,
  state = 'starting',
  recording = false,
  route,
}) {
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    if (state !== 'connected') {
      setCallDuration(0);
      return;
    }
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  const formatTime = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="call-controls-overlay">
      <div className="call-meta-bar">
        {state === 'connected' && (
          <div className="call-timer-badge">
            <span className={recording ? 'rec-dot' : 'live-dot'} />
            <span>{recording ? 'REC' : 'LIVE'} {formatTime(callDuration)}</span>
          </div>
        )}
        <div className="call-security-badge">
          {route === 'relay'
            ? '🔒 Encrypted · Relayed via TURN'
            : route === 'direct'
            ? '🔒 Encrypted · Direct'
            : '🔒 Encrypted'}
        </div>
      </div>

      <div className="call-buttons-dock">
        <button
          type="button"
          className={`control-btn ${isMuted ? 'btn-active-off' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <IconMicOff /> : <IconMic />}
          <span className="control-btn-label">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          type="button"
          className={`control-btn ${isVideoOff ? 'btn-active-off' : ''}`}
          onClick={onToggleVideo}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? <IconVideoOff /> : <IconVideo />}
          <span className="control-btn-label">{isVideoOff ? 'Camera On' : 'Camera Off'}</span>
        </button>

        {isAgent && onTakeSnapshot && (
          <button
            type="button"
            className="control-btn btn-snapshot"
            onClick={onTakeSnapshot}
            disabled={snapshotDisabled || busySnapshot}
            title={snapshotUrl ? 'Retake face snapshot' : 'Take face snapshot'}
          >
            <IconCamera />
            <span className="control-btn-label">
              {busySnapshot ? 'Saving…' : snapshotUrl ? 'Retake' : 'Snapshot'}
            </span>
          </button>
        )}

        <button
          type="button"
          className="control-btn btn-hangup"
          onClick={onHangUp}
          disabled={hangUpDisabled}
          title={hangUpLabel}
        >
          <IconPhoneOff />
          <span className="control-btn-label">{hangUpLabel}</span>
        </button>
      </div>
    </div>
  );
}

// Incoming call phone-like popup card fixed at bottom-right
export function IncomingCallPopup({ customer, onAccept, onDecline }) {
  if (!customer) return null;
  return (
    <div className="incoming-call-popup" role="alert">
      <div className="incoming-pulse-icon">
        <IconPhoneCall />
        <div className="pulse-ring" />
      </div>
      <div className="incoming-call-popup-body">
        <div className="incoming-tag">Incoming video KYC call</div>
        <h4 className="incoming-customer-name">{customer.kyc_name || 'Customer'}</h4>
        <p className="incoming-customer-sub">
          Session: <code>{customer.id.slice(0, 8)}</code>
        </p>
        <div className="incoming-popup-actions">
          <button type="button" className="btn-accept-popup" onClick={() => onAccept(customer.id)}>
            Accept
          </button>
          <button type="button" className="btn-decline-popup" onClick={onDecline}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

// Banner showing incoming customer video KYC call for the agent (kept for backwards compatibility)
export function IncomingCallBanner({ customer, onAccept }) {
  if (!customer) return null;
  return (
    <div className="incoming-call-card">
      <div className="incoming-pulse-icon">
        <IconPhoneCall />
        <div className="pulse-ring" />
      </div>
      <div className="incoming-call-info">
        <div className="incoming-title-row">
          <span className="incoming-tag">INCOMING V-CIP CALL</span>
          <span className="badge badge-waiting">Waiting in Queue</span>
        </div>
        <h3 className="incoming-customer-name">{customer.kyc_name || 'Customer'}</h3>
        <p className="incoming-customer-sub">
          Session ID: <code>{customer.id.slice(0, 8)}</code> · SnapKYC ID Verified
        </p>
      </div>
      <button className="btn btn-accept-call" onClick={() => onAccept(customer.id)}>
        <IconPhoneCall /> Pick Up Call
      </button>
    </div>
  );
}
