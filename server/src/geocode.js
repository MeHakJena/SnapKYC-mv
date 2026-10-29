// Reverse geocoding via OpenStreetMap Nominatim.
// Best-effort lookup for human-readable city/state/country; never throws.

export async function placeFromCoords(lat, lng) {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_GEOCODE === 'true') {
    return null;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'SnapKYC-Video-PoC/1.0 (mehakjena8@gmail.com)',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      console.warn(`[geocode] Nominatim returned HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const address = data?.address || {};
    const city = address.city || address.town || address.village || address.suburb || address.county;
    const state = address.state;
    const country = address.country;

    const parts = [city, state, country].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  } catch (err) {
    console.warn('[geocode] place lookup failed:', err.message);
    return null;
  }
}
