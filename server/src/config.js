// All settings come from environment variables (see .env.example).
// Nothing secret is hard-coded for production: if a required secret is
// missing while NODE_ENV=production, the server refuses to start.
import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

function secret(name, devFallback) {
  const value = process.env[name];
  if (value) return value;
  if (isProd) throw new Error(`Missing required environment variable ${name}`);
  console.warn(`[config] ${name} not set, using an insecure development value`);
  return devFallback;
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),

  // Postgres connection string (Supabase or Neon). Empty = in-memory DB for local dev.
  databaseUrl: process.env.DATABASE_URL || '',

  // Two different secrets on purpose: one for staff logins, one for KYC tokens.
  authSecret: secret('AUTH_JWT_SECRET', 'dev-auth-secret-change-me'),
  kycSecret: secret('KYC_TOKEN_SECRET', 'dev-kyc-secret-change-me'),
  mockSnapkycKey: secret('MOCK_SNAPKYC_KEY', 'dev-mock-snapkyc-key'),
  kycTokenTtlDays: Number(process.env.KYC_TOKEN_TTL_DAYS || 30),

  // Password shared by all hard-coded demo users.
  demoPassword: secret('DEMO_PASSWORD', 'demo123'),

  // Comma-separated list of allowed browser origins (only needed if the
  // frontend is hosted separately, e.g. on Vercel).
  clientOrigins: (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Media storage. Empty SUPABASE_URL = save files to server/data/uploads.
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseBucket: process.env.SUPABASE_BUCKET || 'kyc-media',

  // Location rule. Set to "true" only for testers outside India.
  allowOutsideIndia: process.env.ALLOW_OUTSIDE_INDIA === 'true',

  // TURN relay. Either Metered (domain + API key) or static credentials.
  turn: {
    meteredDomain: process.env.METERED_DOMAIN || '', // e.g. yourapp.metered.live
    meteredApiKey: process.env.METERED_API_KEY || '',
    urls: process.env.TURN_URLS || '', // comma-separated turn: URLs
    username: process.env.TURN_USERNAME || '',
    credential: process.env.TURN_CREDENTIAL || '',
  },
};
