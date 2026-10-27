// The "KYC done" token: a plain JWT signed by this server (HS256).
// Anyone can paste it into the public check page; only this server can tell
// whether the signature is genuine, because only it knows KYC_TOKEN_SECRET.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

const ISSUER = 'snapkyc-video';
const AUDIENCE = 'kyc-verifier';

export function issueKycToken(session) {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    {
      name: session.kyc_name,
      kyc_status: 'verified',
      method: 'V-CIP (video, maker-checker)',
    },
    config.kycSecret,
    {
      algorithm: 'HS256',
      subject: session.id,
      issuer: ISSUER,
      audience: AUDIENCE,
      jwtid: jti,
      expiresIn: `${config.kycTokenTtlDays}d`,
    }
  );
  const { exp } = jwt.decode(token);
  return { token, jti, expiresAt: new Date(exp * 1000) };
}

export function checkKycToken(token) {
  const cleaned = String(token || '').trim();
  if (!cleaned) return { valid: false, reason: 'No token provided' };
  try {
    const claims = jwt.verify(cleaned, config.kycSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return { valid: true, claims };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, reason: 'Token has expired', claims: jwt.decode(cleaned) };
    }
    return { valid: false, reason: 'Signature or format is not valid (token was not issued here, or was changed)' };
  }
}
