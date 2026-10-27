// Reviewer (checker) screens: watch the recording, then approve or reject.
// Approval is the ONLY place a KYC token is created.
import { Router } from 'express';
import { query, getSession } from '../db.js';
import { logEvent, listEvents } from '../events.js';
import { requireRole } from '../auth.js';
import { STATUS, canDecide } from '../rules.js';
import { issueKycToken } from '../kycToken.js';
import { sessionForStaff, baseUrl } from './shared.js';

export const reviewerRouter = Router();
reviewerRouter.use(requireRole('reviewer'));

reviewerRouter.get('/sessions', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, status, kyc_name, agent_id, agent_decision, agent_decided_at, reviewer_id, reviewer_decision, reviewed_at
     FROM sessions WHERE status IN ($1, $2, $3) ORDER BY updated_at DESC LIMIT 50`,
    [STATUS.RECOMMENDED, STATUS.APPROVED, STATUS.REJECTED]
  );
  res.json(rows);
});

reviewerRouter.get('/sessions/:id', async (req, res) => {
  const s = await getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  res.json({ ...(await sessionForStaff(s, baseUrl(req))), events: await listEvents(s.id) });
});

// Audit entry when the reviewer actually plays the recording.
reviewerRouter.post('/sessions/:id/viewed', async (req, res) => {
  const s = await getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  await logEvent(s.id, 'reviewer', req.user.id, 'recording_viewed');
  res.json({ ok: true });
});

reviewerRouter.post('/sessions/:id/decision', async (req, res) => {
  const { decision } = req.body || {};
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision must be approve or reject' });
  if (decision === 'reject' && !reason) return res.status(400).json({ error: 'Tell the customer why it was rejected' });

  const s = await getSession(req.params.id);
  const check = canDecide(req.user, s);
  if (!check.ok) {
    if (s) await logEvent(s.id, 'reviewer', req.user.id, 'decision_blocked', { reason: check.reason });
    return res.status(check.code).json({ error: check.reason });
  }

  const now = new Date();
  let token = null;
  let jti = null;
  let expiresAt = null;
  if (decision === 'approve') ({ token, jti, expiresAt } = issueKycToken(s));

  // agent_id <> reviewer and status check are repeated in SQL, so the rule holds even under a race.
  const { rows } = await query(
    `UPDATE sessions SET status=$2, reviewer_id=$3, reviewer_decision=$4, reviewer_reason=$5, reviewed_at=$6,
       token=$7, token_jti=$8, token_expires_at=$9, updated_at=$6
     WHERE id=$1 AND status=$10 AND agent_id <> $3 RETURNING id`,
    [s.id, decision === 'approve' ? STATUS.APPROVED : STATUS.REJECTED, req.user.id, decision,
      reason || null, now, token, jti, expiresAt, STATUS.RECOMMENDED]
  );
  if (!rows.length) return res.status(409).json({ error: 'Session changed, please reload' });

  await logEvent(s.id, 'reviewer', req.user.id, decision === 'approve' ? 'approved' : 'rejected', { reason });
  if (token) await logEvent(s.id, 'system', null, 'token_issued', { jti, expiresAt });
  res.json({ ok: true, status: decision === 'approve' ? STATUS.APPROVED : STATUS.REJECTED });
});
