// Where snapshots and recordings go.
// - SUPABASE_URL set: private Supabase Storage bucket, viewed through short-lived signed URLs.
// - Otherwise: files on local disk (server/data/uploads), viewed through a short-lived signed link.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const LOCAL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'uploads');
const supabase =
  config.supabaseUrl && config.supabaseServiceKey
    ? createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } })
    : null;

export const storageMode = supabase ? 'supabase' : 'local';

export async function saveFile(key, buffer, contentType) {
  if (supabase) {
    const { error } = await supabase.storage
      .from(config.supabaseBucket)
      .upload(key, buffer, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return key;
  }
  const filePath = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  return key;
}

// A link the browser can open for ~10 minutes. Recordings are never public.
export async function viewUrl(key, baseUrl) {
  if (!key) return null;
  if (supabase) {
    const { data, error } = await supabase.storage.from(config.supabaseBucket).createSignedUrl(key, 600);
    if (error) throw new Error(`Could not sign URL: ${error.message}`);
    return data.signedUrl;
  }
  const t = jwt.sign({ key }, config.authSecret, { expiresIn: '10m', audience: 'snapkyc-media' });
  return `${baseUrl}/api/media?t=${encodeURIComponent(t)}`;
}

// Only used in local mode, by GET /api/media.
export async function readLocalFile(signedToken) {
  const { key } = jwt.verify(signedToken, config.authSecret, { audience: 'snapkyc-media' });
  const filePath = path.join(LOCAL_DIR, key);
  if (!filePath.startsWith(LOCAL_DIR)) throw new Error('Bad path');
  return { filePath, key };
}
