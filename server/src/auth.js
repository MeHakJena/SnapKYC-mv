// Staff login with hard-coded demo users (allowed by the brief).
// Customers have no account: they prove ownership of a session with a random
// secret that only their browser holds.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

// supervisor1 holds BOTH roles. It exists to show that maker-checker is an
// identity rule, not just a role rule: supervisor1 can run a call and can
// review calls, but can never review a call they ran.
export const USERS = [
  { id: 'agent1', name: 'Asha (Agent)', roles: ['agent'] },
  { id: 'agent2', name: 'Ravi (Agent)', roles: ['agent'] },
  { id: 'reviewer1', name: 'Meera (Reviewer)', roles: ['reviewer'] },
  { id: 'supervisor1', name: 'Kiran (Agent + Reviewer)', roles: ['agent', 'reviewer'] },
];

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function login(username, password) {
  const user = USERS.find((u) => u.id === username);
  if (!user || !safeEqual(password, config.demoPassword)) return null;
  const token = jwt.sign({ sub: user.id, name: user.name, roles: user.roles }, config.authSecret, {
    expiresIn: '12h',
    audience: 'snapkyc-staff',
  });
  return { token, user };
}

export function verifyStaffToken(token) {
  const claims = jwt.verify(token, config.authSecret, { audience: 'snapkyc-staff' });
  return { id: claims.sub, name: claims.name, roles: claims.roles };
}

// Express middleware: requires a valid staff login with the given role.
export function requireRole(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please log in' });
    try {
      req.user = verifyStaffToken(token);
    } catch {
      return res.status(401).json({ error: 'Login expired, please log in again' });
    }
    if (!req.user.roles.includes(role)) {
      return res.status(403).json({ error: `This needs the ${role} role` });
    }
    next();
  };
}

// --- customer session secrets ---------------------------------------------

export const newCustomerSecret = () => crypto.randomBytes(32).toString('base64url');
export const hashSecret = (secret) => crypto.createHash('sha256').update(String(secret)).digest('hex');

export function customerOwnsSession(session, secret) {
  return Boolean(session && secret && safeEqual(hashSecret(secret), session.customer_secret_hash));
}
