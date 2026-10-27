// Agent (maker) screens: queue, pick up a call, snapshot, recording, recommendation.
import { Router } from 'express';
import multer from 'multer';
import { query, getSession } from '../db.js';
import { logEvent, listEvents } from '../events.js';
import { requireRole } from '../auth.js';
import { STATUS, canRecommend } from '../rules.js';
import { pickQuestions } from '../questions.js';
import { saveFile, viewUrl } from '../storage.js';
import { sessionForStaff, baseUrl } from './shared.js';

export const agentRouter = Router();
agentRouter.use(requireRole('agent'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Waiting customers, plus calls this agent already picked up.
agentRouter.get('/queue', async (req, res) => {
  const { rows } = await query(
    `SELECT id, status, kyc_name, agent_id, created_at, updated_at FROM sessions
     WHERE status = $1 OR (status = $2 AND agent_id = $3)
     ORDER BY created_at ASC`,
    [STATUS.WAITING, STATUS.IN_CALL, req.user.id]
  );
  res.json(rows);
});

// Pick up a waiting customer. The WHERE clause makes this safe if two agents click at once.
agentRouter.post('/sessions/:id/claim', async (req, res) => {
  const questions = pickQuestions(3);
  const { rows } = await query(
    `UPDATE sessions SET status=$2, agent_id=$3, questions=$4, updated_at=$5
     WHERE id=$1 AND status=$6 RETURNING id`,
    [req.params.id, STATUS.IN_CALL, req.user.id, JSON.stringify(questions), new Date(), STATUS.WAITING]
  );
  if (!rows.length) {
    const s = await getSession(req.params.id);
    if (s?.status === STATUS.IN_CALL && s.agent_id === req.user.id) return res.json({ ok: true }); // rejoin
    return res.status(409).json({ error: 'This customer is no longer waiting' });
  }
  await logEvent(req.params.id, 'agent', req.user.id, 'call_claimed', { questions });
  res.json({ ok: true });
});

async function loadOwnCall(req, res, next) {
  const s = await getSession(req.params.id);
  if (!s || s.agent_id !== req.user.id) return res.status(404).json({ error: 'Not your call' });
  req.kyc = s;
  next();
}

agentRouter.get('/sessions/:id', loadOwnCall, async (req, res) => {
  res.json({
    ...(await sessionForStaff(req.kyc, baseUrl(req))),
    events: await listEvents(req.kyc.id),
  });
});

// Put a customer back in the queue (e.g. the call dropped before anything was saved).
agentRouter.post('/sessions/:id/release', loadOwnCall, async (req, res) => {
  if (req.kyc.status !== STATUS.IN_CALL) return res.status(409).json({ error: 'Call is not active' });
  await query('UPDATE sessions SET status=$2, agent_id=NULL, updated_at=$3 WHERE id=$1', [req.kyc.id, STATUS.WAITING, new Date()]);
  await logEvent(req.kyc.id, 'agent', req.user.id, 'call_released');
  res.json({ ok: true });
});

agentRouter.post('/sessions/:id/snapshot', loadOwnCall, upload.single('file'), async (req, res) => {
  if (req.kyc.status !== STATUS.IN_CALL) return res.status(409).json({ error: 'Call is not active' });
  if (!req.file) return res.status(400).json({ error: 'No image received' });
  const key = `${req.kyc.id}/snapshot-${Date.now()}.jpg`;
  await saveFile(key, req.file.buffer, 'image/jpeg');
  await query('UPDATE sessions SET snapshot_key=$2, updated_at=$3 WHERE id=$1', [req.kyc.id, key, new Date()]);
  await logEvent(req.kyc.id, 'agent', req.user.id, 'snapshot_taken', { key, bytes: req.file.size });
  res.json({ ok: true, url: await viewUrl(key, baseUrl(req)) });
});

agentRouter.post('/sessions/:id/recording', loadOwnCall, upload.single('file'), async (req, res) => {
  if (req.kyc.status !== STATUS.IN_CALL) return res.status(409).json({ error: 'Call is not active' });
  if (!req.file) return res.status(400).json({ error: 'No recording received' });
  const type = (req.file.mimetype || 'video/webm').split(';')[0];
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const key = `${req.kyc.id}/recording-${Date.now()}.${ext}`;
  await saveFile(key, req.file.buffer, type);
  await query('UPDATE sessions SET recording_key=$2, recording_type=$3, updated_at=$4 WHERE id=$1', [req.kyc.id, key, type, new Date()]);
  await logEvent(req.kyc.id, 'agent', req.user.id, 'recording_saved', {
    key,
    bytes: req.file.size,
    durationSec: Number(req.body?.durationSec) || null,
  });
  res.json({ ok: true });
});

// The maker's recommendation. It does NOT approve anything by itself.
agentRouter.post('/sessions/:id/recommend', loadOwnCall, async (req, res) => {
  const { decision, note } = req.body || {};
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision must be approve or reject' });
  const check = canRecommend(req.user, req.kyc);
  if (!check.ok) return res.status(check.code).json({ error: check.reason });

  await query(
    `UPDATE sessions SET status=$2, agent_decision=$3, agent_note=$4, agent_decided_at=$5, updated_at=$5
     WHERE id=$1 AND status=$6`,
    [req.kyc.id, STATUS.RECOMMENDED, decision, String(note || '').slice(0, 1000), new Date(), STATUS.IN_CALL]
  );
  await logEvent(req.kyc.id, 'agent', req.user.id, `recommend_${decision}`, { note: note || '' });
  res.json({ ok: true });
});

// Also kept as a timestamped audit entry.
agentRouter.post('/sessions/:id/questions-asked', loadOwnCall, async (req, res) => {
  const asked = Array.isArray(req.body?.asked) ? req.body.asked.slice(0, 10).map(String) : [];
  await logEvent(req.kyc.id, 'agent', req.user.id, 'questions_asked', { asked });
  res.json({ ok: true });
});
