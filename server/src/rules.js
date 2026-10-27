// The business rules, kept as plain functions so they are easy to read and test.
// Routes call these BEFORE changing anything; the UI is never trusted to enforce them.

export const STATUS = {
  CONSENTED: 'consented', // consent + location saved
  WAITING: 'waiting', // mock SnapKYC done, customer waiting for an agent
  IN_CALL: 'in_call', // an agent has picked up the session
  RECOMMENDED: 'recommended', // agent (maker) gave a recommendation
  APPROVED: 'approved', // reviewer (checker) approved, token issued
  REJECTED: 'rejected', // reviewer rejected, customer told why
};

const deny = (reason, code = 403) => ({ ok: false, reason, code });
const allow = { ok: true };

export const hasRole = (user, role) => Array.isArray(user?.roles) && user.roles.includes(role);

// Rough bounding box for India. Good enough for a PoC; a real system would
// use a proper boundary check plus IP cross-validation.
export function isInIndia(lat, lng) {
  return lat >= 6.5 && lat <= 37.6 && lng >= 68.1 && lng <= 97.4;
}

// Agent (maker) may recommend only on their own call, and only once the
// snapshot and recording are saved.
export function canRecommend(user, session) {
  if (!hasRole(user, 'agent')) return deny('Only agents can recommend');
  if (!session) return deny('Session not found', 404);
  if (session.agent_id !== user.id) return deny('This call belongs to another agent');
  if (session.status !== STATUS.IN_CALL) return deny(`Session is "${session.status}", not in a call`, 409);
  if (!session.snapshot_key) return deny('Take a face snapshot before recommending', 409);
  if (!session.recording_key) return deny('Save the call recording before recommending', 409);
  return allow;
}

// Reviewer (checker) makes the final decision. MAKER-CHECKER: the person who
// ran the call can never approve or reject it, even if they also hold the
// reviewer role.
export function canDecide(user, session) {
  if (!hasRole(user, 'reviewer')) return deny('Only reviewers can approve or reject');
  if (!session) return deny('Session not found', 404);
  if (session.agent_id === user.id) {
    return deny('Maker-checker rule: you ran this call, so a different person must review it');
  }
  if (session.status !== STATUS.RECOMMENDED) {
    return deny(`Session is "${session.status}", not waiting for review`, 409);
  }
  return allow;
}
