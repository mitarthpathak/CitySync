// Client-side mirror of the backend's lib/geo.js haversine. Kept independent (frontend and
// backend are separate deploys); used as a stopgap local-scope filter until the backend
// honours the lat/lng query params, and to compute distances shown in the UI.

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isWithinKm(lat, lng, center, km) {
  return haversineKm(center.lat, center.lng, lat, lng) <= km;
}
