// Reverse geocoding via OpenStreetMap Nominatim with BigDataCloud fallback.
// Best-effort lookup for human-readable city/state/country; never throws.

export async function placeFromCoords(lat, lng) {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_GEOCODE === 'true') {
    return null;
  }

  // 1. Try OpenStreetMap Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'SnapKYC-Video-PoC/1.0 (mehakjena8@gmail.com)',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      const address = data?.address || {};
      const city = address.city || address.town || address.village || address.suburb || address.county;
      const state = address.state;
      const country = address.country;

      const parts = [city, state, country].filter(Boolean);
      if (parts.length) return parts.join(', ');
    } else {
      console.warn(`[geocode] Nominatim returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[geocode] Nominatim lookup failed:', err.message);
  }

  // 2. Fallback: BigDataCloud (relieves datacenter IP blocking on cloud hosts like Render)
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
    const res = await fetch(bdcUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const d = await res.json();
      const city = d.city || d.locality;
      const state = d.principalSubdivision;
      const country = d.countryName;
      const parts = [city, state, country].filter(Boolean);
      const deduped = parts.filter((p, i) => parts.indexOf(p) === i);
      if (deduped.length) return deduped.join(', ');
    }
  } catch (err) {
    console.warn('[geocode] Fallback geocode failed:', err.message);
  }

  return null;
}
