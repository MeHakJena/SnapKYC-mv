// MOCK of Ooru's SnapKYC. No real Aadhaar data is used anywhere.
//
// Real SnapKYC: the user approves the request in the Aadhaar app and the
// business receives a cryptographically signed response. We imitate that shape:
// the mock returns { data, signature } and our server checks the signature
// before trusting the data. The full ID number is never stored, only the last 4.
import crypto from 'node:crypto';
import { config } from './config.js';

const NAMES = ['Ananya Sharma', 'Mehak J', 'Priya Nair', 'Arjun Rao', 'Kavya Iyer', 'Vikram Singh'];
const COLORS = ['#3b5bdb', '#0b7285', '#5f3dc4', '#c2255c', '#2b8a3e', '#e8590c'];

function placeholderPhoto(name, color) {
  const initials = name.split(' ').map((p) => p[0]).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" viewBox="0 0 240 300">
<rect width="240" height="300" fill="${color}"/>
<circle cx="120" cy="115" r="58" fill="rgba(255,255,255,0.85)"/>
<rect x="40" y="185" width="160" height="115" rx="70" fill="rgba(255,255,255,0.85)"/>
<text x="120" y="132" font-family="Arial, sans-serif" font-size="44" font-weight="700" text-anchor="middle" fill="${color}">${initials}</text>
<text x="120" y="288" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="${color}">MOCK PHOTO</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const sign = (data) =>
  crypto.createHmac('sha256', config.mockSnapkycKey).update(JSON.stringify(data)).digest('base64url');

export function isValidDummyId(idNumber) {
  return /^\d{12}$/.test(String(idNumber || '').replace(/\s/g, ''));
}

// What the "SnapKYC service" would return. Same ID always gives the same person.
export function mockSnapkycResponse(idNumber) {
  const digits = String(idNumber).replace(/\s/g, '');
  const hash = crypto.createHash('sha256').update(digits).digest();
  const name = NAMES[hash[0] % NAMES.length];
  const year = 1975 + (hash[1] % 30);
  const month = String(1 + (hash[2] % 12)).padStart(2, '0');
  const day = String(1 + (hash[3] % 28)).padStart(2, '0');
  const data = {
    ref: `MOCK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    name,
    dob: `${year}-${month}-${day}`,
    photo: placeholderPhoto(name, COLORS[hash[4] % COLORS.length]),
    id_last4: digits.slice(-4),
    consent: 'approved-in-mock-aadhaar-app',
    issued_at: new Date().toISOString(),
  };
  return { data, signature: sign(data) };
}

// Our side of the integration: refuse anything whose signature does not match.
export function verifySnapkycResponse({ data, signature }) {
  const expected = sign(data);
  return (
    typeof signature === 'string' &&
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}
