import { NavLink, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Customer from './pages/Customer.jsx';
import Agent from './pages/Agent.jsx';
import Reviewer from './pages/Reviewer.jsx';
import Verify from './pages/Verify.jsx';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="logo">✓</span> SnapKYC <span className="muted">Video</span>
        </NavLink>
        <nav>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/customer">Customer</NavLink>
          <NavLink to="/agent">Agent</NavLink>
          <NavLink to="/reviewer">Reviewer</NavLink>
          <NavLink to="/verify">Check a token</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/customer" element={<Customer />} />
          <Route path="/agent" element={<Agent />} />
          <Route path="/reviewer" element={<Reviewer />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
      <footer className="footer">Proof of concept · all Aadhaar data is mocked · use a dummy ID only</footer>
    </div>
  );
}
