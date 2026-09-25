'use strict';

// Amer Fort, Jaipur. Center of the "local" scope and of the simulated Amer feed.
const AMER = Object.freeze({ lat: 26.9855, lng: 75.8513 });
// Amity University Rajasthan campus, NH-11C Kant Kalwar - ~5 km north of Achrol town.
// A second fully-detailed local point (not the default), reached via the location selector.
const ACHROL = Object.freeze({ lat: 27.1764, lng: 75.9568 });
const LOCAL_RADIUS_KM = 15;

// Origins that the single-point local adapters (mappls, bhuvan) loop over, each producing
// its own set of events. Add a third here if another named local point needs the same depth.
const LOCAL_POINTS = Object.freeze([
  { id: 'amer', label: 'Amer', ...AMER },
  { id: 'achrol', label: 'Achrol / Amity University', ...ACHROL },
]);

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE_LAT = 111.32;

const toRad = (deg) => (deg * Math.PI) / 180;
const round = (n, places) => Number(n.toFixed(places));

/** Great-circle distance in km between two lat/lng points. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** True when the event lies within `km` of `center`. */
function isWithinKm(event, center, km) {
  return haversineKm(center.lat, center.lng, event.lat, event.lng) <= km;
}

/** Random point uniformly distributed inside a disc of `maxKm` around `center`. */
function scatterAround(center, maxKm) {
  const distanceKm = maxKm * Math.sqrt(Math.random());
  const bearing = Math.random() * 2 * Math.PI;
  const dLat = (distanceKm * Math.cos(bearing)) / KM_PER_DEGREE_LAT;
  const dLng = (distanceKm * Math.sin(bearing)) / (KM_PER_DEGREE_LAT * Math.cos(toRad(center.lat)));
  return { lat: round(center.lat + dLat, 6), lng: round(center.lng + dLng, 6) };
}

module.exports = { AMER, ACHROL, LOCAL_POINTS, LOCAL_RADIUS_KM, haversineKm, isWithinKm, scatterAround };
