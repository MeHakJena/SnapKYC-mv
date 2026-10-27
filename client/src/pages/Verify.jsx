// Public check page: anyone can paste a KYC token and see if it's genuine and unexpired.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { ErrorBox } from '../components/common.jsx';

export default function Verify() {
  const location = useLocation();
  const [token, setToken] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function check(value = token) {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api('/api/verify', { method: 'POST', body: { token: value } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // A scanned QR opens /verify#token=... : fill it in and check straight away.
  // (The token is in the # part, so it is never sent to the server in the URL.)
  useEffect(() => {
    const match = location.hash.match(/token=([^&]+)/);
    if (match) {
      const t = decodeURIComponent(match[1]);
      setToken(t);
      check(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);

  const c = result?.claims;
  return (
    <div className="card narrow">
      <h2>Check a KYC token</h2>
      <p className="muted">Paste a token to see whether it was issued by SnapKYC Video and is still valid.</p>
      <textarea rows={6} className="token" placeholder="eyJhbGciOi…" value={token} onChange={(e) => setToken(e.target.value)} />
      <button className="btn primary" disabled={!token.trim() || busy} onClick={() => check()}>
        {busy ? 'Checking…' : 'Check token'}
      </button>
      <ErrorBox error={error} />
      {result && (
        <div className={`verdict ${result.valid ? 'ok' : 'bad'}`}>
          <div className="verdict-title">{result.valid ? '✓ Valid KYC token' : '✕ Not valid'}</div>
          {!result.valid && <p>{result.reason}</p>}
          {c && (
            <dl className="facts">
              <dt>Name</dt><dd>{c.name}</dd>
              <dt>KYC status</dt><dd>{c.kyc_status}</dd>
              <dt>Method</dt><dd>{c.method}</dd>
              <dt>Issued</dt><dd>{new Date(c.iat * 1000).toLocaleString()}</dd>
              <dt>Expires</dt><dd>{new Date(c.exp * 1000).toLocaleString()}</dd>
              <dt>Issuer</dt><dd>{c.iss}</dd>
              <dt>Session</dt><dd className="mono small">{c.sub}</dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
