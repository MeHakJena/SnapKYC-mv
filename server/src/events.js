// Audit trail: every step of a session is saved here with a timestamp.
import crypto from 'node:crypto';
import { query } from './db.js';

export async function logEvent(sessionId, actorType, actorId, action, detail = {}) {
  await query(
    `INSERT INTO events (id, session_id, actor_type, actor_id, action, detail, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [crypto.randomUUID(), sessionId, actorType, actorId, action, JSON.stringify(detail), new Date()]
  );
}

export async function listEvents(sessionId) {
  const { rows } = await query(
    'SELECT actor_type, actor_id, action, detail, created_at FROM events WHERE session_id = $1 ORDER BY created_at ASC',
    [sessionId]
  );
  return rows;
}
