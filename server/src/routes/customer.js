// Customer screens: consent + location, mock SnapKYC, then status / token.
// No account: the browser keeps a random secret returned when the session is created.
import crypto from 'node:crypto';
import { Router } from 'express';
import { query, getSession } from '../db.js';
import { logEvent } from '../events.js';
import { newCustomerSecret, hashSecret, customerOwnsSession } from '../auth.js';
import { STATUS, isInIndia } from '../rules.js';
import { config } from '../config.js';
import { isValidDummyId, mockSnapkycResponse, verifySnapkycResponse } from '../mockSnapkyc.js';
import { placeFromCoords } from '../geocode.js';

export const customerRouter = Router();

const CONSENT_TEXT =
  'I agree to a live video KYC call that will be recorded, and to my location and the details from SnapKYC being saved for verification.';

customerRouter.get('/consent-text', (_req, res) => res.json({ text: CONSENT_TEXT }));

// Step 1: consent + location. Both are saved with timestamps.
customerRouter.post('/sessions', async (req, res) => {
  const { consent, location } = req.body || {};
  if (consent !== true) return res.status(400).json({ error: 'Consent is required before the call' });

  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Location is required. Please allow location access.' });
  }
  const inIndia = isInIndia(lat, lng);
  if (!inIndia && !config.allowOutsideIndia) {
    return res.status(403).json({ error: 'Video KYC is only available while you are in India.' });
  }

  const place = await placeFromCoords(lat, lng);

  const id = crypto.randomUUID();
  const secret = newCustomerSecret();
  const now = new Date();
  const locationAt = location?.capturedAt ? new Date(location.capturedAt) : now;

  await query(
    `INSERT INTO sessions (id, customer_secret_hash, status, consent_text, consent_at,
       lat, lng, location_accuracy, location_at, in_india, location_place, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
    [id, hashSecret(secret), STATUS.CONSENTED, CONSENT_TEXT, now, lat, lng,
      Number(location?.accuracy) || null, locationAt, inIndia, place, now]
  );
  await logEvent(id, 'customer', null, 'consent_given', { text: CONSENT_TEXT });
  await logEvent(id, 'customer', null, 'location_captured', { lat, lng, accuracy: location?.accuracy, inIndia, place });

  res.status(201).json({ sessionId: id, secret });
});

// Everything below needs the session secret in the x-session-secret header.
async function loadOwnSession(req, res, next) {
  const session = await getSession(req.params.id);
  if (!customerOwnsSession(session, req.get('x-session-secret'))) {
    return res.status(404).json({ error: 'Session not found' });
  }
  req.session = session;
  next();
}

// Step 2: mock SnapKYC. Only a dummy 12-digit ID is accepted; only its last 4 digits are stored.
customerRouter.post('/sessions/:id/snapkyc', loadOwnSession, async (req, res) => {
  const s = req.session;
  if (s.status !== STATUS.CONSENTED) return res.status(409).json({ error: 'SnapKYC check already done' });
  const idNumber = String(req.body?.idNumber || '').replace(/\s/g, '');
  if (!isValidDummyId(idNumber)) return res.status(400).json({ error: 'Enter a 12-digit dummy ID number' });

  const response = mockSnapkycResponse(idNumber); // stands in for a call to the SnapKYC API
  if (!verifySnapkycResponse(response)) return res.status(502).json({ error: 'SnapKYC response signature invalid' });
  const d = response.data;

  await query(
    `UPDATE sessions SET status=$2, snapkyc_ref=$3, kyc_name=$4, kyc_dob=$5, kyc_photo=$6, id_last4=$7, updated_at=$8
     WHERE id=$1`,
    [s.id, STATUS.WAITING, d.ref, d.name, d.dob, d.photo, d.id_last4, new Date()]
  );
  await logEvent(s.id, 'customer', null, 'snapkyc_verified', { ref: d.ref, idLast4: d.id_last4, signatureChecked: true });

  res.json({ name: d.name, dob: d.dob, photo: d.photo, idLast4: d.id_last4, ref: d.ref });
});

// Customer left the call early without completing the review.
customerRouter.post('/sessions/:id/leave', loadOwnSession, async (req, res) => {
  await logEvent(req.session.id, 'customer', null, 'customer_left');
  res.json({ ok: true });
});

// Status poll: what the customer sees (waiting, in review, rejected + reason, or the token).
customerRouter.get('/sessions/:id', loadOwnSession, async (req, res) => {
  const s = req.session;
  res.json({
    id: s.id,
    status: s.status,
    profile: s.kyc_name ? { name: s.kyc_name, dob: s.kyc_dob, photo: s.kyc_photo, idLast4: s.id_last4 } : null,
    rejectionReason: s.status === STATUS.REJECTED ? s.reviewer_reason : null,
    token: s.status === STATUS.APPROVED ? s.token : null,
    tokenExpiresAt: s.status === STATUS.APPROVED ? s.token_expires_at : null,
  });
});
