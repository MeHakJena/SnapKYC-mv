import { viewUrl } from '../storage.js';

// The URL the browser used to reach this server (Render sits behind a proxy, see trust proxy).
export const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;

// The session as staff see it: never includes the customer secret hash.
export async function sessionForStaff(s, base) {
  return {
    id: s.id,
    status: s.status,
    consent: { text: s.consent_text, at: s.consent_at },
    location: { lat: s.lat, lng: s.lng, accuracy: s.location_accuracy, at: s.location_at, inIndia: s.in_india, place: s.location_place },
    profile: { name: s.kyc_name, dob: s.kyc_dob, photo: s.kyc_photo, idLast4: s.id_last4, ref: s.snapkyc_ref },
    agentId: s.agent_id,
    questions: typeof s.questions === 'string' ? JSON.parse(s.questions) : s.questions || [],
    snapshotUrl: await viewUrl(s.snapshot_key, base),
    recordingUrl: await viewUrl(s.recording_key, base),
    recordingType: s.recording_type,
    agentDecision: s.agent_decision,
    agentNote: s.agent_note,
    agentDecidedAt: s.agent_decided_at,
    reviewerId: s.reviewer_id,
    reviewerDecision: s.reviewer_decision,
    reviewerReason: s.reviewer_reason,
    reviewedAt: s.reviewed_at,
    tokenExpiresAt: s.token_expires_at,
    createdAt: s.created_at,
  };
}
