// ICE servers for WebRTC. STUN finds each browser's public address; TURN relays
// the video when a direct connection is blocked (different networks, strict NAT).
import { config } from './config.js';

const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun.relay.metered.ca:80'] };
let cache = { at: 0, servers: null };

export async function getIceServers(debug = false) {
  const t = config.turn;

  // Option A: Metered — fetch short-lived TURN credentials with the API key (cached for 1 hour).
  if (t.meteredDomain && t.meteredApiKey) {
    if (!debug && cache.servers && Date.now() - cache.at < 60 * 60 * 1000) return cache.servers;
    const domain = t.meteredDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const apiKey = t.meteredApiKey.trim();
    try {
      const targetUrl = `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
      const r = await fetch(targetUrl);
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status}: ${text}`);
      }
      const servers = await r.json();
      cache = { at: Date.now(), servers: [STUN, ...servers] };
      return cache.servers;
    } catch (err) {
      console.warn('[ice] could not fetch Metered TURN credentials:', err.message);
      if (debug) {
        return {
          error: err.message,
          domain,
          apiKeyLength: apiKey.length,
          hint: 'Check if API key matches Metered dashboard Developers tab',
        };
      }
    }
  }

  // Option B: static TURN credentials from env.
  if (t.urls && t.username && t.credential) {
    return [STUN, { urls: t.urls.split(',').map((u) => u.trim()), username: t.username, credential: t.credential }];
  }

  if (debug) {
    return {
      error: 'TURN credentials not active',
      meteredDomainSet: Boolean(t.meteredDomain),
      meteredApiKeySet: Boolean(t.meteredApiKey),
      staticTurnSet: Boolean(t.urls && t.username && t.credential),
    };
  }

  // No TURN: works on the same network, may fail across networks.
  return [STUN];
}
