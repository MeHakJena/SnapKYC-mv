// Database access. Uses real Postgres when DATABASE_URL is set,
// otherwise an in-memory Postgres (pg-mem) so the app runs locally with zero setup.
import pg from 'pg';
import { config } from './config.js';

let pool;

export function parsePgConfig(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(/^["']|["']$/g, '');
  if (s.startsWith('psql ')) s = s.replace(/^psql\s+["']?/, '').replace(/["']?$/, '');
  if (s.startsWith('DATABASE_URL=')) s = s.replace(/^DATABASE_URL=/, '').trim();
  s = s.replace(/^(postgres(?:ql)?:\/\/)/i, '');

  const atIdx = s.lastIndexOf('@');
  if (atIdx === -1) {
    return { host: s, database: 'postgres', port: 5432 };
  }

  const userPass = s.slice(0, atIdx);
  const hostPortDb = s.slice(atIdx + 1);

  const colonIdx = userPass.indexOf(':');
  const user = colonIdx !== -1 ? userPass.slice(0, colonIdx) : userPass;
  let password = colonIdx !== -1 ? userPass.slice(colonIdx + 1) : '';
  if (password.startsWith('[') && password.endsWith(']')) {
    password = password.slice(1, -1);
  }

  const slashIdx = hostPortDb.indexOf('/');
  const hostPort = slashIdx !== -1 ? hostPortDb.slice(0, slashIdx) : hostPortDb;
  let database = slashIdx !== -1 ? hostPortDb.slice(slashIdx + 1) : 'postgres';
  if (database.includes('?')) database = database.slice(0, database.indexOf('?'));

  const [host, portStr] = hostPort.split(':');
  const port = portStr ? parseInt(portStr, 10) : 5432;

  let finalUser = user;
  let finalPassword = password;
  try { finalUser = decodeURIComponent(user); } catch {}
  try { finalPassword = decodeURIComponent(password); } catch {}

  return {
    user: finalUser,
    password: finalPassword,
    host,
    port,
    database: database || 'postgres',
  };
}

export function normalizeDatabaseUrl(url) {
  const c = parsePgConfig(url);
  if (!c || !c.user) return url;
  return `postgresql://${c.user}:${encodeURIComponent(c.password)}@${c.host}:${c.port}/${c.database}`;
}

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
    const pgConfig = parsePgConfig(config.databaseUrl);
    const isLocal = /localhost|127\.0\.0\.1/.test(pgConfig.host || '');
    pool = new pg.Pool({
      ...pgConfig,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
    });
    console.log(`[db] connecting to Postgres at ${pgConfig.host}:${pgConfig.port}/${pgConfig.database} as ${pgConfig.user}`);
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
