import { Link } from 'react-router-dom';
import './home.css';

const STEPS = [
  {
    num: 1,
    title: 'Consent & location',
    actor: 'Customer',
    desc: 'Ticks the consent box and shares browser location. Both are saved with a timestamp.',
  },
  {
    num: 2,
    title: 'SnapKYC check',
    actor: 'Customer',
    desc: 'A mock SnapKYC service returns a signed dummy name, date of birth and photo.',
  },
  {
    num: 3,
    title: 'Live video call',
    actor: 'Customer + agent',
    desc: 'Two-way WebRTC video. The call is recorded and the agent takes a face snapshot.',
  },
  {
    num: 4,
    title: 'Agent recommends',
    actor: 'Agent, maker',
    desc: 'Asks three random questions, then recommends approve or reject.',
  },
  {
    num: 5,
    title: 'Reviewer decides',
    actor: 'Reviewer, checker',
    tag: 'Approval gate',
    isGate: true,
    desc: 'A different person watches the recording and makes the final call.',
  },
  {
    num: 6,
    title: 'Token issued',
    actor: 'Anyone can check',
    desc: 'Approval signs a KYC token, shown as a QR code that any verifier can check.',
  },
];

const ROLES = [
  {
    title: 'Customer',
    desc: 'Start a video KYC. No account needed.',
    to: '/customer',
    cta: 'Start KYC →',
  },
  {
    title: 'Agent',
    desc: 'Pick up waiting customers and run the call. Demo login: agent1',
    to: '/agent',
    cta: 'Open agent console →',
  },
  {
    title: 'Reviewer',
    desc: 'Watch recordings and approve or reject. Demo login: reviewer1',
    to: '/reviewer',
    cta: 'Open review queue →',
  },
  {
    title: 'Verifier',
    desc: 'Paste a token to see if it is genuine and unexpired.',
    to: '/verify',
    cta: 'Check a token →',
  },
];

const RULES = [
  {
    title: 'Consent first',
    desc: 'No consent, no session. The consent text and time are stored.',
  },
  {
    title: 'Customer is in India',
    desc: 'Location is captured and the server refuses sessions from outside India.',
  },
  {
    title: 'Live call, not an upload',
    desc: 'Video goes browser to browser in real time, relayed through TURN when networks block a direct path.',
  },
  {
    title: 'Call is recorded',
    desc: 'The agent cannot recommend until the recording and snapshot are saved.',
  },
  {
    title: 'Maker-checker',
    desc: 'The server refuses any decision from the person who ran the call, even if they also hold the reviewer role.',
  },
];

export default function Home() {
  return (
    <div className="home">
      {/* a) Hero Section */}
      <section className="home-hero">
        <div className="home-hero-text">
          <h1>Verify a customer on a live video call, then let a second person approve it.</h1>
          <p className="home-hero-description">
            SnapKYC Video is a proof of concept of RBI’s video KYC (V-CIP). A customer talks to an agent on a recorded
            call, a different reviewer makes the final decision, and the customer leaves with a signed token anyone can check.
          </p>
          <div className="home-hero-actions">
            <Link to="/customer" className="home-btn-primary">
              Start KYC as a customer
            </Link>
            <Link to="/verify" className="home-btn-outline">
              Check a token
            </Link>
          </div>
        </div>

        <div className="home-hero-card-col">
          <div className="home-token-card">
            <div className="home-token-card-header">
              <div className="home-token-tick">✓</div>
              <div>
                <h3 className="home-token-title">KYC verified</h3>
                <p className="home-token-subtitle">Signed by SnapKYC Video</p>
              </div>
            </div>

            <div className="home-token-rows">
              <div className="home-token-row">
                <span className="home-token-label">Name</span>
                <span className="home-token-val">Priya Nair</span>
              </div>
              <div className="home-token-row">
                <span className="home-token-label">Method</span>
                <span className="home-token-val">Video call, maker-checker</span>
              </div>
              <div className="home-token-row">
                <span className="home-token-label">Run by</span>
                <span className="home-token-val">agent1</span>
              </div>
              <div className="home-token-row">
                <span className="home-token-label">Approved by</span>
                <span className="home-token-val">reviewer1</span>
              </div>
              <div className="home-token-row">
                <span className="home-token-label">Valid for</span>
                <span className="home-token-val">30 days</span>
              </div>
            </div>

            <div className="home-token-jwt-box">
              <code className="home-token-jwt">eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzZXNzXzk4MjMiLCJ...</code>
            </div>

            <p className="home-token-caption">Example token. Dummy data only.</p>
          </div>
        </div>
      </section>

      {/* b) How a Session Moves */}
      <section className="home-section">
        <h2 className="home-section-title">How a session moves</h2>
        <p className="home-subtitle">
          Six steps, one approval gate. Every step is written to the audit trail with a timestamp.
        </p>

        <div className="home-steps-container">
          <div className="home-steps-line" />
          <div className="home-steps-grid">
            {STEPS.map((step) => (
              <div key={step.num} className={`home-step-item ${step.isGate ? 'is-gate' : ''}`}>
                <div className="home-step-circle-wrapper">
                  <div className="home-step-num">{step.num}</div>
                </div>
                <div>
                  {step.tag && <span className="home-gate-tag">{step.tag}</span>}
                  <h3 className="home-step-title">{step.title}</h3>
                  <div className="home-step-actor">{step.actor}</div>
                  <p className="home-step-desc">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="home-steps-note">
          If the reviewer rejects, the customer is told why and can start again.
        </div>
      </section>

      {/* c) Choose where to start */}
      <section className="home-section">
        <h2 className="home-section-title">Choose where to start</h2>
        <p className="home-subtitle">
          Each part of the app is a different person in the KYC. Open them in separate tabs to run the whole flow on one computer.
        </p>

        <div className="home-roles-grid">
          {ROLES.map((role) => (
            <Link key={role.title} to={role.to} className="home-role-card">
              <div className="home-role-top">
                <h3 className="home-role-title">{role.title}</h3>
                <p className="home-role-desc">{role.desc}</p>
              </div>
              <span className="home-role-link">{role.cta}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* d) Built Around RBI's Five V-CIP Rules */}
      <section className="home-rules-box">
        <div className="home-rules-left">
          <h2>Built around RBI’s five V-CIP rules</h2>
          <p>Each rule is checked on the server, not just hidden in the interface.</p>
        </div>

        <div className="home-rules-list">
          {RULES.map((rule) => (
            <div key={rule.title} className="home-rule-item">
              <div className="home-rule-bullet" />
              <div className="home-rule-text">
                <span className="home-rule-title">{rule.title}: </span>
                {rule.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* e) What is Mocked Note */}
      <section className="home-mock-note">
        <strong>What is mocked. </strong>
        The Aadhaar check is a fake SnapKYC service that returns dummy data. Use a dummy 12-digit ID such as{' '}
        <code>9999 0000 1234</code>, never a real Aadhaar number. Staff logins are demo accounts.
      </section>
    </div>
  );
}
