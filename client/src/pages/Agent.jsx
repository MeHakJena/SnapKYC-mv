// Agent (maker) console: pick up a waiting customer, run the call, take a
// snapshot, save the recording, then RECOMMEND. The agent cannot approve.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fmtTime } from '../lib/api.js';
import { getCamera, startCall, stopStream } from '../lib/call.js';
import { startRecording, captureSnapshot } from '../lib/recorder.js';
import { StreamVideo, ErrorBox, LoginForm, StaffBar, useStaffLogin, CallControlsBar, IncomingCallPopup, IconPhoneCall } from '../components/common.jsx';

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
  const [incomingCall, setIncomingCall] = useState(null);
  const seenIdsRef = useRef(new Set());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const newRows = await api('/api/agent/queue', { token: auth.token });
        if (!alive) return;
        setRows(newRows);
        setError('');

        // Dismiss popup if customer is no longer waiting
        setIncomingCall((current) => {
          if (!current) return null;
          const stillWaiting = newRows.some((r) => r.id === current.id && r.status === 'waiting');
          return stillWaiting ? current : null;
        });

        // Track non-waiting or in_call rows so they never trigger popups
        newRows.forEach((r) => {
          if (r.status !== 'waiting') seenIdsRef.current.add(r.id);
        });

        // Trigger popup only for a NEW customer with status 'waiting'
        const newWaiting = newRows.find(
          (r) => r.status === 'waiting' && !seenIdsRef.current.has(r.id)
        );
        if (newWaiting) {
          seenIdsRef.current.add(newWaiting.id);
          setIncomingCall(newWaiting);
        }
      } catch (e) {
        if (alive) setError(e.message);
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [auth.token]);

  // Auto-dismiss popup after 30 seconds
  useEffect(() => {
    if (!incomingCall) return;
    const timer = setTimeout(() => setIncomingCall(null), 30000);
    return () => clearTimeout(timer);
  }, [incomingCall]);

  // Update title and play gentle ringtone while incoming call popup is visible
  useEffect(() => {
    if (!incomingCall) return;
    const prevTitle = document.title;
    document.title = '📞 Incoming call – SnapKYC';

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const playTone = (freq, start, duration) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + start);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + start);
          osc.stop(ctx.currentTime + start + duration);
        };
        playTone(660, 0, 0.15);
        playTone(880, 0.22, 0.22);
      }
    } catch {}

    return () => {
      document.title = prevTitle;
    };
  }, [incomingCall]);

  async function pick(id) {
    try {
      await api(`/api/agent/sessions/${id}/claim`, { method: 'POST', token: auth.token });
      onPick(id);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <h2>Customer Queue</h2>
        <span className="badge badge-waiting">{rows.length} Waiting</span>
      </div>
      <ErrorBox error={error} />

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

      {incomingCall && (
        <IncomingCallPopup
          customer={incomingCall}
          onAccept={(id) => {
            setIncomingCall(null);
            pick(id);
          }}
          onDecline={() => setIncomingCall(null)}
        />
      )}
    </div>
  );
}

function CallConsole({ auth, sessionId, onDone }) {
  const [info, setInfo] = useState(null);
  const [local, setLocal] = useState(null);
  const [remote, setRemote] = useState(null);
  const [state, setState] = useState('starting');
  const [route, setRoute] = useState(null);
  const [customerLeft, setCustomerLeft] = useState(false);
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [recording, setRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
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
    if (s.recordingUrl) {
      setHasRecording(true);
      setCallEnded(true);
    }
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
          onRoute: setRoute,
          onCustomerLeft: () => setCustomerLeft(true),
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
    if (state !== 'connected' || !remote || !local || recorderRef.current || hasRecording || callEnded) return;
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
  }, [state, remote, local, hasRecording, callEnded, sessionId, auth.user.id]);

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
      setHasRecording(true);
      setCallEnded(true);
      await load();
    } catch (e) {
      setError(`Could not save the recording: ${e.message}`);
    } finally {
      setBusy('');
    }
  }

  async function handleHangUp() {
    let confirmMsg = 'Are you sure you want to end this call?';
    if (!snapshotUrl) {
      confirmMsg =
        "No face snapshot was taken. Without a snapshot this session can't be recommended, and you will need to return the customer to the queue. End the call anyway?";
    }
    if (!window.confirm(confirmMsg)) return;

    if (recorderRef.current) {
      await endCallAndSave();
    } else {
      callRef.current?.endCall();
      callRef.current?.close();
      stopStream(local);
      setLocal(null);
      setRemote(null);
      setCallEnded(true);
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
  const callLive = !callEnded;
  const missing = [];
  if (!snapshotUrl) missing.push('face snapshot');
  if (!hasRecording) missing.push('recording');
  const missingText = missing.join(' and ');
  const canRecommend = callEnded && snapshotUrl && hasRecording;

  const statusText = customerLeft
    ? 'The customer left the call. End the call to save the recording, then recommend reject, or return the customer to the queue.'
    : state === 'connected'
    ? 'Connected'
    : state === 'peer-left'
    ? 'Customer disconnected'
    : state.startsWith('error')
    ? state
    : 'Waiting for the customer to connect…';

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
                onHangUp={handleHangUp}
                hangUpLabel={busy === 'recording' ? 'Saving…' : 'End & Cut Call'}
                hangUpDisabled={busy === 'recording'}
                isAgent={true}
                onTakeSnapshot={takeSnapshot}
                snapshotUrl={snapshotUrl}
                busySnapshot={busy === 'snapshot'}
                snapshotDisabled={!remote || state !== 'connected'}
                state={state}
                recording={recording}
                route={route}
              />
            </div>
            <div className="row between call-quick-actions">
              <span className="muted small">
                {snapshotUrl ? '✓ Face snapshot captured and stored' : '⚠️ Snapshot recommended before ending call'}
              </span>
              <button className="btn link" onClick={release}>Return customer to queue</button>
            </div>
          </>
        ) : snapshotUrl && hasRecording ? (
          <div className="alert alert-ok">Call ended and recording saved. Now make your recommendation.</div>
        ) : (
          <div className="alert alert-error">
            <p>
              This session can't be recommended because the {missingText} {missing.length > 1 ? 'are' : 'is'} missing. Return the customer to the queue so the call can be done again.
            </p>
            <div style={{ marginTop: '12px' }}>
              <button className="btn" onClick={release}>Return customer to queue</button>
            </div>
          </div>
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
          {callEnded && !canRecommend && (
            <p className="muted small" style={{ color: 'var(--danger, #b42318)' }}>
              Cannot recommend: {missingText} {missing.length > 1 ? 'are' : 'is'} missing.
            </p>
          )}
          {!callEnded && !snapshotUrl && (
            <p className="muted small" style={{ color: 'var(--danger, #b42318)' }}>
              A face snapshot is required to approve.
            </p>
          )}
          <div className="row">
            <button className="btn primary" disabled={!canRecommend || !!busy} onClick={() => recommend('approve')}>Recommend approve</button>
            <button className="btn danger" disabled={!canRecommend || !!busy} onClick={() => recommend('reject')}>Recommend reject</button>
          </div>
          {callEnded && !canRecommend && (
            <div style={{ marginTop: '12px' }}>
              <button className="btn" onClick={release}>Return customer to queue</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
