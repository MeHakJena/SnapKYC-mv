// Database access. Uses real Postgres when DATABASE_URL is set,
// otherwise an in-memory Postgres (pg-mem) so the app runs locally with zero setup.
import pg from 'pg';
import { config } from './config.js';

let pool;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    customer_secret_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    consent_text TEXT,
    consent_at TIMESTAMPTZ,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    location_accuracy DOUBLE PRECISION,
    location_at TIMESTAMPTZ,
    in_india BOOLEAN,
    snapkyc_ref TEXT,
    kyc_name TEXT,
    kyc_dob TEXT,
    kyc_photo TEXT,
    id_last4 TEXT,
    agent_id TEXT,
    questions JSONB,
    snapshot_key TEXT,
    recording_key TEXT,
    recording_type TEXT,
    agent_decision TEXT,
    agent_note TEXT,
    agent_decided_at TIMESTAMPTZ,
    reviewer_id TEXT,
    reviewer_decision TEXT,
    reviewer_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    token TEXT,
    token_jti TEXT,
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL
  )`,
];

export async function initDb() {
  if (config.databaseUrl) {
    const isLocal = /localhost|127\.0\.0\.1/.test(config.databaseUrl);
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
    });
    console.log('[db] using Postgres from DATABASE_URL');
  } else {
    const { newDb } = await import('pg-mem');
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    pool = new Pool();
    console.log('[db] DATABASE_URL not set, using in-memory database (data resets on restart)');
  }
  for (const statement of SCHEMA) await pool.query(statement);
}

export function query(text, params = []) {
  return pool.query(text, params);
}

export async function getSession(id) {
  const { rows } = await query('SELECT * FROM sessions WHERE id = $1', [id]);
  return rows[0] || null;
}
