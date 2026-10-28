// Agent (maker) console: pick up a waiting customer, run the call, take a
// snapshot, save the recording, then RECOMMEND. The agent cannot approve.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fmtTime } from '../lib/api.js';
import { getCamera, startCall, stopStream } from '../lib/call.js';
import { startRecording, captureSnapshot } from '../lib/recorder.js';
import { StreamVideo, ErrorBox, LoginForm, StaffBar, useStaffLogin, CallControlsBar, IncomingCallBanner, IconPhoneCall } from '../components/common.jsx';

export default function Agent() {
  const { auth, login, logout } = useStaffLogin('agent');
  const [activeId, setActiveId] = useState(null);

  if (!auth) return <LoginForm role="agent" onLogin={login} />;
  return (
    <div>
      <StaffBar auth={auth} onLogout={logout} />
      {activeId ? (
        <CallConsole auth={auth} sessionId={activeId} onDone={() => setActiveId(null)} />
      ) : (
        <Queue auth={auth} onPick={setActiveId} />
      )}
    </div>
  );
}

function Queue({ auth, onPick }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      api('/api/agent/queue', { token: auth.token })
        .then((r) => alive && (setRows(r), setError('')))
        .catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [auth.token]);

  async function pick(id) {
    try {
      await api(`/api/agent/sessions/${id}/claim`, { method: 'POST', token: auth.token });
      onPick(id);
    } catch (e) {
      setError(e.message);
    }
  }

  const waitingCustomer = rows.find((r) => r.status === 'waiting') || rows[0];

  return (
    <div className="card">
      <div className="row between">
        <h2>Customer Queue</h2>
        <span className="badge badge-waiting">{rows.length} Waiting</span>
      </div>
      <ErrorBox error={error} />

      {waitingCustomer && (
        <IncomingCallBanner customer={waitingCustomer} onAccept={pick} />
      )}

      {rows.length === 0 ? (
        <div className="empty-queue-box">
          <div className="pulse-dot" />
          <p className="muted">Waiting for customers to complete mock SnapKYC and join the queue…</p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Customer</th><th>Since</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.kyc_name}<div className="muted small mono">{r.id.slice(0, 8)}</div></td>
                <td>{fmtTime(r.updated_at)}</td>
                <td><span className={`badge badge-${r.status}`}>{r.status === 'in_call' ? 'Your active call' : 'Waiting'}</span></td>
                <td className="right">
                  <button className="btn btn-pick-call" onClick={() => pick(r.id)}>
                    <IconPhoneCall /> {r.status === 'in_call' ? 'Rejoin Call' : 'Pick Up'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CallConsole({ auth, sessionId, onDone }) {
  const [info, setInfo] = useState(null);
  const [local, setLocal] = useState(null);
  const [remote, setRemote] = useState(null);
  const [state, setState] = useState('starting');
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [busy, setBusy] = useState('');
  const [asked, setAsked] = useState({});
  const [note, setNote] = useState('');

  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const callRef = useRef(null);
  const recorderRef = useRef(null);

  const toggleMute = () => {
    if (!local) return;
    const next = !isMuted;
    local.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setIsMuted(next);
  };

  const toggleVideo = () => {
    if (!local) return;
    const next = !isVideoOff;
    local.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    setIsVideoOff(next);
  };

  const load = useCallback(async () => {
    const s = await api(`/api/agent/sessions/${sessionId}`, { token: auth.token });
    setInfo(s);
    if (s.snapshotUrl) setSnapshotUrl(s.snapshotUrl);
    if (s.recordingUrl) setRecordingSaved(true);
    return s;
  }, [sessionId, auth.token]);

  // Start camera + call when the console opens; clean everything up when it closes.
  useEffect(() => {
    let cancelled = false;
    let stream;
    (async () => {
      try {
        const s = await load();
        if (s.recordingUrl) return; // call already finished, only the recommendation is left
        stream = await getCamera();
        if (cancelled) return stopStream(stream);
        setLocal(stream);
        callRef.current = await startCall({
          role: 'agent',
          sessionId,
          auth: { staffToken: auth.token },
          localStream: stream,
          onRemoteStream: setRemote,
          onState: setState,
        });
      } catch (e) {
        setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
      recorderRef.current?.stop();
      callRef.current?.close();
      stopStream(stream);
    };
  }, [sessionId, auth.token, load]);

  // Start recording automatically as soon as the customer's video is connected.
  useEffect(() => {
    if (state !== 'connected' || !remote || !local || recorderRef.current || recordingSaved) return;
    const t = setTimeout(() => {
      try {
        recorderRef.current = startRecording({
          remoteVideo: remoteVideoRef.current,
          localVideo: localVideoRef.current,
          remoteStream: remote,
          localStream: local,
          label: `V-CIP ${sessionId.slice(0, 8)} · agent ${auth.user.id}`,
        });
        setRecording(true);
      } catch (e) {
        setError(`Recording could not start: ${e.message}`);
      }
    }, 800); // give the video a moment to show its first frame
    return () => clearTimeout(t);
  }, [state, remote, local, recordingSaved, sessionId, auth.user.id]);

  async function takeSnapshot() {
    setBusy('snapshot');
    setError('');
    try {
      const blob = await captureSnapshot(remoteVideoRef.current);
      const form = new FormData();
      form.append('file', blob, 'snapshot.jpg');
      const r = await api(`/api/agent/sessions/${sessionId}/snapshot`, { method: 'POST', token: auth.token, form });
      setSnapshotUrl(r.url);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function endCallAndSave() {
    if (!recorderRef.current) return setError('Recording has not started yet. Wait until the customer is connected.');
    setBusy('recording');
    setError('');
    try {
      const { blob, durationSec } = await recorderRef.current.stop();
      recorderRef.current = null;
      setRecording(false);
      const form = new FormData();
      form.append('file', blob, blob.type.includes('mp4') ? 'call.mp4' : 'call.webm');
      form.append('durationSec', String(durationSec));
      await api(`/api/agent/sessions/${sessionId}/recording`, { method: 'POST', token: auth.token, form });
      const askedList = info.questions.filter((_, i) => asked[i]);
      await api(`/api/agent/sessions/${sessionId}/questions-asked`, { method: 'POST', token: auth.token, body: { asked: askedList } });
      callRef.current?.endCall();
      callRef.current?.close();
      stopStream(local);
      setLocal(null);
      setRemote(null);
      setRecordingSaved(true);
      await load();
    } catch (e) {
      setError(`Could not save the recording: ${e.message}`);
    } finally {
      setBusy('');
    }
  }

  async function recommend(decision) {
    setBusy(decision);
    setError('');
    try {
      await api(`/api/agent/sessions/${sessionId}/recommend`, { method: 'POST', token: auth.token, body: { decision, note } });
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy('');
    }
  }

  async function release() {
    try {
      await api(`/api/agent/sessions/${sessionId}/release`, { method: 'POST', token: auth.token });
      onDone();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!info) return <div className="card"><ErrorBox error={error} /><p className="muted">Loading…</p></div>;
  const p = info.profile;
  const callLive = !recordingSaved;
  const statusText =
    state === 'connected' ? 'Connected' : state === 'peer-left' ? 'Customer disconnected' : state.startsWith('error') ? state : 'Waiting for the customer to connect…';

  return (
    <div className="console">
      <div className="card">
        <div className="row between">
          <h2>Call with {p.name}</h2>
          <button className="btn link" onClick={onDone}>← Back to queue</button>
        </div>
        <ErrorBox error={error} />
        {callLive ? (
          <>
            <div className={`status-line ${state === 'connected' ? 'ok' : ''}`}>
              {recording && <span className="rec-dot" />} {statusText}
              {recording && <strong className="rec-label">REC ACTIVE</strong>}
            </div>
            <div className="video-stage">
              {remote ? (
                <StreamVideo stream={remote} videoRef={remoteVideoRef} className="video-main" />
              ) : (
                <div className="video-main placeholder">
                  <div className="pulse-indicator" />
                  <p>Customer video will appear here when connected</p>
                </div>
              )}

              {local && (
                <div className="video-pip-container">
                  <StreamVideo stream={local} muted mirrored videoRef={localVideoRef} className={`video-pip ${isVideoOff ? 'pip-hidden' : ''}`} />
                  {isVideoOff && (
                    <div className="pip-video-off">
                      <span>📷 Camera Off</span>
                    </div>
                  )}
                  {isMuted && <span className="pip-mute-badge">🔇 Muted</span>}
                </div>
              )}

              <CallControlsBar
                isMuted={isMuted}
                onToggleMute={toggleMute}
                isVideoOff={isVideoOff}
                onToggleVideo={toggleVideo}
                onHangUp={() => {
                  if (!snapshotUrl) {
                    setError("Please take a face snapshot of the customer before ending the call (required by RBI V-CIP rule).");
                    return;
                  }
                  endCallAndSave();
                }}
                hangUpLabel={busy === 'recording' ? 'Saving…' : 'End & Cut Call'}
                hangUpDisabled={!recording || busy === 'recording'}
                isAgent={true}
                onTakeSnapshot={takeSnapshot}
                snapshotUrl={snapshotUrl}
                busySnapshot={busy === 'snapshot'}
                snapshotDisabled={!remote || state !== 'connected'}
                state={state}
                recording={recording}
              />
            </div>
            <div className="row between call-quick-actions">
              <span className="muted small">
                {snapshotUrl ? '✓ Face snapshot captured and stored' : '⚠️ Snapshot required before call can be ended'}
              </span>
              <button className="btn link" onClick={release}>Return customer to queue</button>
            </div>
          </>
        ) : (
          <div className="alert alert-ok">Call ended and recording saved. Now make your recommendation.</div>
        )}
      </div>

      <div className="side">
        <div className="card">
          <h3>Customer details</h3>
          <div className="compare">
            <figure>
              <img src={p.photo} alt="Mock SnapKYC photo" />
              <figcaption>SnapKYC photo (mock)</figcaption>
            </figure>
            <figure>
              {snapshotUrl ? <img src={snapshotUrl} alt="Live snapshot" /> : <div className="img-placeholder">No snapshot yet</div>}
              <figcaption>Live snapshot</figcaption>
            </figure>
          </div>
          <dl className="facts">
            <dt>Name</dt><dd>{p.name}</dd>
            <dt>Date of birth</dt><dd>{p.dob}</dd>
            <dt>ID</dt><dd>XXXX XXXX {p.idLast4}</dd>
            <dt>Location</dt>
            <dd>
              {info.location.lat.toFixed(4)}, {info.location.lng.toFixed(4)}{' '}
              <span className={`badge ${info.location.inIndia ? 'badge-approved' : 'badge-rejected'}`}>{info.location.inIndia ? 'In India' : 'Outside India'}</span>
            </dd>
            <dt>Consent</dt><dd>{fmtTime(info.consent.at)}</dd>
          </dl>
        </div>

        <div className="card">
          <h3>Ask these questions</h3>
          <p className="muted small">Picked at random for this session, so answers can't be rehearsed.</p>
          <ul className="checklist">
            {info.questions.map((q, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={!!asked[i]} onChange={(e) => setAsked({ ...asked, [i]: e.target.checked })} disabled={!callLive} /> {q}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Your recommendation</h3>
          <p className="muted small">You are the maker. A different person makes the final decision.</p>
          <textarea rows={3} placeholder="Note for the reviewer (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row">
            <button className="btn primary" disabled={!recordingSaved || !!busy} onClick={() => recommend('approve')}>Recommend approve</button>
            <button className="btn danger" disabled={!recordingSaved || !!busy} onClick={() => recommend('reject')}>Recommend reject</button>
          </div>
        </div>
      </div>
    </div>
  );
}
