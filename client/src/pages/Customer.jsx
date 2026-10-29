// Customer journey: consent + location -> mock SnapKYC -> live call -> result.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, store } from '../lib/api.js';
import { getCamera, startCall, stopStream } from '../lib/call.js';
import { StreamVideo, QrImage, ErrorBox, CallControlsBar } from '../components/common.jsx';

const KEY = 'snapkyc_customer';
const DEMO_ID = '9999 0000 1234';

function stepFor(status) {
  if (!status || status === 'consented') return 'snapkyc';
  if (status === 'waiting' || status === 'in_call') return 'call';
  return 'result';
}

export default function Customer() {
  const [saved, setSaved] = useState(() => store.get(KEY)); // { sessionId, secret }
  const [session, setSession] = useState(null);
  const [step, setStep] = useState(saved ? 'loading' : 'consent');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!saved) return null;
    try {
      const s = await api(`/api/customer/sessions/${saved.sessionId}`, { secret: saved.secret });
      setSession(s);
      return s;
    } catch (err) {
      if (err.status === 404) restart();
      else setError(err.message);
      return null;
    }
  }, [saved]);

  // On load (or refresh of the page), resume where the customer left off.
  useEffect(() => {
    if (saved && step === 'loading') refresh().then((s) => s && setStep(stepFor(s.status)));
  }, [saved, step, refresh]);

  // While waiting for the review, check the status every few seconds.
  useEffect(() => {
    if (step !== 'result' || ['approved', 'rejected'].includes(session?.status)) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [step, session?.status, refresh]);

  const finishCall = useCallback(async () => {
    await refresh();
    setStep('result');
  }, [refresh]);

  function restart() {
    store.remove(KEY);
    setSaved(null);
    setSession(null);
    setError('');
    setStep('consent');
  }

  return (
    <div className="customer">
      <Stepper step={step} />
      <ErrorBox error={error} />
      {step === 'loading' && <p className="muted">Loading your session…</p>}
      {step === 'consent' && (
        <ConsentStep
          onDone={(s) => {
            store.set(KEY, s);
            setSaved(s);
            setStep('snapkyc');
          }}
        />
      )}
      {step === 'snapkyc' && saved && <SnapkycStep saved={saved} onDone={() => setStep('call')} />}
      {step === 'call' && saved && (
        <CallStep saved={saved} onFinished={finishCall} onLeft={() => setStep('left')} refresh={refresh} />
      )}
      {step === 'left' && <LeftStep onRejoin={() => setStep('call')} onRestart={restart} refresh={refresh} />}
      {step === 'result' && session && <ResultStep session={session} onRestart={restart} />}
      {saved && !['result', 'left'].includes(step) && (
        <p className="muted small center">
          <button className="btn link" onClick={restart}>Start over</button>
        </p>
      )}
    </div>
  );
}

function Stepper({ step }) {
  const steps = [['consent', 'Consent & location'], ['snapkyc', 'SnapKYC check'], ['call', 'Video call'], ['result', 'Result']];
  const activeKey = step === 'left' ? 'call' : step;
  const idx = steps.findIndex(([k]) => k === activeKey);
  return (
    <ol className="stepper">
      {steps.map(([k, label], i) => (
        <li key={k} className={i < idx ? 'done' : i === idx ? 'active' : ''}>
          <span>{i + 1}</span> {label}
        </li>
      ))}
    </ol>
  );
}

function ConsentStep({ onDone }) {
  const [text, setText] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/customer/consent-text').then((r) => setText(r.text)).catch((e) => setError(e.message));
  }, []);

  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('This browser cannot share location.'));
      navigator.geolocation.getCurrentPosition(
        async (p) => {
          let place = null;
          try {
            const r = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&localityLanguage=en`,
              { signal: AbortSignal.timeout(2500) }
            );
            if (r.ok) {
              const d = await r.json();
              const city = d.city || d.locality;
              const state = d.principalSubdivision;
              const country = d.countryName;
              const parts = [city, state, country].filter(Boolean);
              const deduped = parts.filter((part, i) => parts.indexOf(part) === i);
              if (deduped.length) place = deduped.join(', ');
            }
          } catch {}
          resolve({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
            capturedAt: new Date(p.timestamp).toISOString(),
            place,
          });
        },
        (err) =>
          reject(new Error(err.code === 1 ? 'Location permission was denied. Allow location for this site and try again.' : 'Could not get your location. Try again.')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const location = await getLocation();
      const s = await api('/api/customer/sessions', { method: 'POST', body: { consent: true, location } });
      onDone(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h2>Before we start</h2>
      <p className="muted">Video KYC lets you verify your identity on a live call instead of visiting a branch.</p>
      <label className="consent">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>{text || 'Loading consent text…'}</span>
      </label>
      <p className="muted small">Next, your browser will ask to share your location. This service is only available in India.</p>
      <ErrorBox error={error} />
      <button className="btn primary" disabled={!agreed || busy} onClick={submit}>
        {busy ? 'Getting location…' : 'I agree, share my location'}
      </button>
    </div>
  );
}

function SnapkycStep({ saved, onDone }) {
  const [idNumber, setIdNumber] = useState('');
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setProfile(await api(`/api/customer/sessions/${saved.sessionId}/snapkyc`, { method: 'POST', secret: saved.secret, body: { idNumber } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (profile) {
    return (
      <div className="card narrow">
        <h2>SnapKYC check passed</h2>
        <div className="profile">
          <img src={profile.photo} alt="Photo returned by mock SnapKYC" />
          <dl>
            <dt>Name</dt><dd>{profile.name}</dd>
            <dt>Date of birth</dt><dd>{profile.dob}</dd>
            <dt>ID</dt><dd>XXXX XXXX {profile.idLast4}</dd>
            <dt>Reference</dt><dd><code>{profile.ref}</code></dd>
          </dl>
        </div>
        <p className="muted small">These details are dummy data from a mock SnapKYC service. Only the last 4 ID digits are stored.</p>
        <button className="btn primary" onClick={onDone}>Join the video call</button>
      </div>
    );
  }

  return (
    <div className="card narrow">
      <h2>SnapKYC check (mock)</h2>
      <p className="muted">
        In the real product you would approve this request in your Aadhaar app. Here, enter any <strong>dummy</strong> 12-digit number.
        Never enter a real Aadhaar number.
      </p>
      <form onSubmit={submit} className="stack">
        <label>
          Dummy ID number
          <input inputMode="numeric" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="12 digits" />
        </label>
        <button type="button" className="btn link left" onClick={() => setIdNumber(DEMO_ID)}>Use demo ID {DEMO_ID}</button>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy || idNumber.replace(/\s/g, '').length !== 12}>
          {busy ? 'Checking…' : 'Run SnapKYC check'}
        </button>
      </form>
    </div>
  );
}

function CallStep({ saved, onFinished, onLeft, refresh }) {
  const [local, setLocal] = useState(null);
  const [remote, setRemote] = useState(null);
  const [state, setState] = useState('starting');
  const [route, setRoute] = useState(null);
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const callRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let stream;
    (async () => {
      try {
        stream = await getCamera();
        if (cancelled) return stopStream(stream);
        setLocal(stream);
        callRef.current = await startCall({
          role: 'customer',
          sessionId: saved.sessionId,
          auth: { secret: saved.secret },
          localStream: stream,
          onRemoteStream: setRemote,
          onState: setState,
          onRoute: setRoute,
          onCallEnded: () => onFinished(),
        });
      } catch (err) {
        setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
      callRef.current?.close();
      stopStream(stream);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.sessionId]);

  // Safety net: if the agent's "call ended" message is missed, notice the status change.
  useEffect(() => {
    const t = setInterval(async () => {
      const s = await refresh();
      if (s && !['waiting', 'in_call'].includes(s.status)) onFinished();
    }, 5000);
    return () => clearInterval(t);
  }, [refresh, onFinished]);

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

  const handleHangUp = async () => {
    if (window.confirm('Are you sure you want to leave this video KYC call?')) {
      try {
        await api(`/api/customer/sessions/${saved.sessionId}/leave`, {
          method: 'POST',
          secret: saved.secret,
        });
      } catch {}
      callRef.current?.leaveCall();
      callRef.current?.close();
      stopStream(local);
      onLeft();
    }
  };

  const message =
    state === 'connected' ? 'Connected to your KYC officer. This call is being recorded.'
      : state === 'peer-left' ? 'The officer disconnected. Please wait, they may rejoin.'
        : state.startsWith('error') ? state.replace('error: ', 'Problem: ')
          : remote ? 'Connecting…' : 'Waiting for a KYC officer to join. Please keep this page open.';

  return (
    <div className="card call-card">
      <div className="row between call-header">
        <h2>Live Video KYC Call</h2>
        <span className="badge badge-in_call">V-CIP Session</span>
      </div>
      <ErrorBox error={error} />
      <div className={`status-line ${state === 'connected' ? 'ok' : ''}`}>
        {state === 'connected' && <span className="rec-dot" />} {message}
      </div>
      <div className="video-stage">
        {remote ? (
          <StreamVideo stream={remote} className="video-main" />
        ) : (
          <div className="video-main placeholder">
            <div className="pulse-indicator" />
            <p>Waiting for the KYC officer to join…</p>
            <span className="muted small">Your camera is live and ready</span>
          </div>
        )}

        {local && (
          <div className="video-pip-container">
            <StreamVideo stream={local} muted mirrored className={`video-pip ${isVideoOff ? 'pip-hidden' : ''}`} />
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
          hangUpLabel="Leave Call"
          state={state}
          route={route}
        />
      </div>
      <p className="muted small center">
        Keep your face clearly visible and your dummy ID card ready. The officer will ask you a few questions.
      </p>
    </div>
  );
}

function LeftStep({ onRejoin, onRestart, refresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleRejoin() {
    setBusy(true);
    setError('');
    const s = await refresh();
    setBusy(false);
    if (s && ['waiting', 'in_call'].includes(s.status)) {
      onRejoin();
    } else {
      setError(
        s?.status === 'approved' || s?.status === 'rejected'
          ? 'This session has already been decided by the reviewer.'
          : 'This session is no longer waiting for a call.'
      );
    }
  }

  return (
    <div className="card narrow center">
      <div className="big-icon bad">⏏</div>
      <h2>You left the call</h2>
      <p className="muted">You disconnected from the video KYC call before it was completed.</p>
      <ErrorBox error={error} />
      <div className="row center">
        <button className="btn primary" onClick={handleRejoin} disabled={busy}>
          {busy ? 'Checking session…' : 'Rejoin call'}
        </button>
        <button className="btn" onClick={onRestart}>Start over</button>
      </div>
    </div>
  );
}

function ResultStep({ session, onRestart }) {
  if (session.status === 'approved') {
    const verifyUrl = `${window.location.origin}/verify#token=${session.token}`;
    return (
      <div className="card narrow center">
        <div className="big-icon ok">✓</div>
        <h2>KYC approved</h2>
        <p className="muted">A second officer approved your video KYC. This signed token proves it. Anyone can scan the QR or paste the token on the check page.</p>
        <QrImage text={verifyUrl} />
        <textarea className="token" readOnly value={session.token} rows={5} onFocus={(e) => e.target.select()} />
        <div className="row center">
          <button className="btn" onClick={() => navigator.clipboard?.writeText(session.token)}>Copy token</button>
          <Link className="btn primary" to={`/verify#token=${session.token}`}>Open check page</Link>
        </div>
        <p className="muted small">Valid until {new Date(session.tokenExpiresAt).toLocaleString()}</p>
      </div>
    );
  }
  if (session.status === 'rejected') {
    return (
      <div className="card narrow center">
        <div className="big-icon bad">✕</div>
        <h2>KYC not approved</h2>
        <div className="alert alert-error">Reason: {session.rejectionReason}</div>
        <p className="muted">You can try again with a new session.</p>
        <button className="btn primary" onClick={onRestart}>Try again</button>
      </div>
    );
  }
  return (
    <div className="card narrow center">
      <div className="spinner" />
      <h2>Your call is being reviewed</h2>
      <p className="muted">A second officer checks every video KYC before it is approved. This page updates automatically.</p>
    </div>
  );
}
