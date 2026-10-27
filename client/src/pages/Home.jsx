import { Link } from 'react-router-dom';

const STEPS = [
  ['Customer', 'Gives consent and location, runs the mock SnapKYC check, joins the live video call.', '/customer', 'Start KYC'],
  ['Agent (maker)', 'Runs the call, takes a face snapshot, records it, recommends approve or reject.', '/agent', 'Agent console'],
  ['Reviewer (checker)', 'Watches the recording and makes the final decision. Cannot review a call they ran.', '/reviewer', 'Review queue'],
  ['Verifier', 'Anyone can paste a KYC token and see whether it is genuine and unexpired.', '/verify', 'Check a token'],
];

export default function Home() {
  return (
    <div>
      <section className="hero">
        <h1>Video KYC with a second-person approval gate</h1>
        <p className="muted">
          A small version of RBI's V-CIP: a live, recorded, consented video call with an agent, then a different
          person approves it before a signed &ldquo;KYC done&rdquo; token is issued.
        </p>
      </section>
      <div className="grid4">
        {STEPS.map(([title, text, to, cta], i) => (
          <div className="card step-card" key={to}>
            <div className="step-num">{i + 1}</div>
            <h3>{title}</h3>
            <p className="muted">{text}</p>
            <Link className="btn" to={to}>{cta}</Link>
          </div>
        ))}
      </div>
      <p className="muted small center">
        Tip for a demo on one computer: open the Customer, Agent and Reviewer pages in separate tabs or windows.
      </p>
    </div>
  );
}
