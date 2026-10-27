// Reviewer (checker) console: watch the recording, compare faces, read the
// audit trail, then approve or reject. Approval is what issues the KYC token.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fmtTime } from '../lib/api.js';
import { ErrorBox, LoginForm, StaffBar, StatusBadge, Timeline, useStaffLogin } from '../components/common.jsx';

export default function Reviewer() {
  const { auth, login, logout } = useStaffLogin('reviewer');
  const [selected, setSelected] = useState(null);

  if (!auth) return <LoginForm role="reviewer" onLogin={login} />;
  return (
    <div>
      <StaffBar auth={auth} onLogout={logout} />
      {selected ? (
        <ReviewDetail auth={auth} sessionId={selected} onBack={() => setSelected(null)} />
      ) : (
        <ReviewList auth={auth} onOpen={setSelected} />
      )}
    </div>
  );
}

function ReviewList({ auth, onOpen }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      api('/api/reviewer/sessions', { token: auth.token })
        .then((r) => alive && (setRows(r), setError('')))
        .catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [auth.token]);

  const pending = rows.filter((r) => r.status === 'recommended');
  const done = rows.filter((r) => r.status !== 'recommended');

  const table = (list, empty) =>
    list.length === 0 ? (
      <p className="muted">{empty}</p>
    ) : (
      <table className="table">
        <thead>
          <tr><th>Customer</th><th>Agent</th><th>Agent says</th><th>Status</th><th /></tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td>{r.kyc_name}<div className="muted small mono">{r.id.slice(0, 8)}</div></td>
              <td>
                {r.agent_id}
                {r.agent_id === auth.user.id && <div className="small warn-text">you ran this call</div>}
              </td>
              <td>{r.agent_decision}</td>
              <td><StatusBadge status={r.status} /></td>
              <td className="right"><button className="btn" onClick={() => onOpen(r.id)}>Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  return (
    <>
      <div className="card">
        <h2>Waiting for your review</h2>
        <ErrorBox error={error} />
        {table(pending, 'Nothing to review right now. This list refreshes every few seconds.')}
      </div>
      <div className="card">
        <h3>Recently decided</h3>
        {table(done, 'No decisions yet.')}
      </div>
    </>
  );
}

function ReviewDetail({ auth, sessionId, onBack }) {
  const [s, setS] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const viewedLogged = useRef(false);

  const load = useCallback(
    () => api(`/api/reviewer/sessions/${sessionId}`, { token: auth.token }).then(setS).catch((e) => setError(e.message)),
    [sessionId, auth.token]
  );
  useEffect(() => {
    load();
  }, [load]);

  function onPlay() {
    if (viewedLogged.current) return;
    viewedLogged.current = true;
    api(`/api/reviewer/sessions/${sessionId}/viewed`, { method: 'POST', token: auth.token }).then(load).catch(() => {});
  }

  async function decide(decision) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/reviewer/sessions/${sessionId}/decision`, { method: 'POST', token: auth.token, body: { decision, reason } });
      await load();
    } catch (e) {
      setError(e.message); // e.g. the maker-checker rule from the server
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <div className="card"><ErrorBox error={error} /><p className="muted">Loading…</p></div>;
  const p = s.profile;
  const ranThisCall = s.agentId === auth.user.id;

  return (
    <div className="console">
      <div className="card">
        <div className="row between">
          <h2>{p.name} <StatusBadge status={s.status} /></h2>
          <button className="btn link" onClick={onBack}>← Back</button>
        </div>
        <h3>Call recording</h3>
        {s.recordingUrl ? (
          <video className="recording" src={s.recordingUrl} controls playsInline onPlay={onPlay} />
        ) : (
          <p className="muted">No recording.</p>
        )}
        <h3>Audit trail</h3>
        <Timeline events={s.events} />
      </div>

      <div className="side">
        <div className="card">
          <h3>Face check</h3>
          <div className="compare">
            <figure>
              <img src={p.photo} alt="Mock SnapKYC photo" />
              <figcaption>SnapKYC photo (mock)</figcaption>
            </figure>
            <figure>
              {s.snapshotUrl ? <img src={s.snapshotUrl} alt="Live snapshot" /> : <div className="img-placeholder">No snapshot</div>}
              <figcaption>Live snapshot</figcaption>
            </figure>
          </div>
          <dl className="facts">
            <dt>Date of birth</dt><dd>{p.dob}</dd>
            <dt>ID</dt><dd>XXXX XXXX {p.idLast4}</dd>
            <dt>Location</dt>
            <dd>
              {s.location.lat.toFixed(4)}, {s.location.lng.toFixed(4)}{' '}
              <span className={`badge ${s.location.inIndia ? 'badge-approved' : 'badge-rejected'}`}>{s.location.inIndia ? 'In India' : 'Outside India'}</span>
            </dd>
            <dt>Consent</dt><dd>{fmtTime(s.consent.at)}</dd>
            <dt>Questions</dt><dd>{s.questions.join(' · ')}</dd>
          </dl>
        </div>

        <div className="card">
          <h3>Agent recommendation</h3>
          <p>
            <strong>{s.agentId}</strong> recommended <strong>{s.agentDecision?.toUpperCase()}</strong> at {fmtTime(s.agentDecidedAt)}
          </p>
          {s.agentNote && <p className="muted">&ldquo;{s.agentNote}&rdquo;</p>}
        </div>

        <div className="card">
          <h3>Final decision</h3>
          {s.status === 'recommended' ? (
            <>
              {ranThisCall && (
                <div className="alert alert-warn">
                  You ran this call. The server will block your decision (maker-checker). Ask another reviewer.
                </div>
              )}
              <ErrorBox error={error} />
              <textarea rows={3} placeholder="Reason (required to reject; shown to the customer)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="row">
                <button className="btn primary" disabled={busy} onClick={() => decide('approve')}>Approve & issue token</button>
                <button className="btn danger" disabled={busy} onClick={() => decide('reject')}>Reject</button>
              </div>
            </>
          ) : (
            <p>
              <strong>{s.reviewerDecision?.toUpperCase()}</strong> by {s.reviewerId} at {fmtTime(s.reviewedAt)}
              {s.reviewerReason && <span className="muted"> · {s.reviewerReason}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
