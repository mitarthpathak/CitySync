'use strict';

// ISRO Bhuvan (NRSC) routing: road route from each local centre (Amer, Achrol/Amity) to
// critical city destinations (hospital, railway, airport, bus stand). Destinations are
// geocoded once at build time (scripts/geocode-destinations.js -> data/access-destinations.json),
// never hardcoded. Distance is the sum of the returned road geometry; Bhuvan returns no
// travel time, so none is claimed. A high road/straight-line ratio flags a detour-prone access.

const fs = require('fs');
const path = require('path');
const config = require('../lib/config');
const { fetchText } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { LOCAL_POINTS } = require('../lib/geo');

const DESTINATIONS_FILE = path.join(__dirname, '..', 'data', 'access-destinations.json');
const URL = 'https://bhuvan-app1.nrsc.gov.in/api/routing/curl_routing_state.php';
const MAX_ROUTE_POINTS = 150; // geometry kept for the map overlay, thinned

let lastStats = null;

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

async function route(origin, dest, token) {
  const url = `${URL}?lat1=${origin.lat}&lon1=${origin.lng}&lat2=${dest.lat}&lon2=${dest.lng}&token=${token}`;
  // Bhuvan is slow and answers with plain text on bad input, so parse defensively.
  const body = await fetchText(url, { timeoutMs: 20000 });
  let geo;
  try { geo = JSON.parse(body); } catch { throw new Error(`bhuvan: non-JSON reply "${body.trim().slice(0, 60)}"`); }
  const lines = (geo?.features ?? []).flatMap((f) => (f.geometry?.type === 'MultiLineString' ? f.geometry.coordinates : f.geometry?.type === 'LineString' ? [f.geometry.coordinates] : []));
  if (!lines.length) throw new Error('bhuvan: route has no geometry');
  const roadKm = lines.reduce((sum, line) => sum + line.slice(1).reduce((s, p, i) => s + haversineKm(line[i], p), 0), 0);
  const straightKm = haversineKm([origin.lng, origin.lat], [dest.lng, dest.lat]);
  const points = lines.flat();
  const step = Math.max(1, Math.ceil(points.length / MAX_ROUTE_POINTS));
  return { roadKm, straightKm, segments: lines.length, geometry: lines.map((l) => l.filter((_, i) => i % step === 0 || i === l.length - 1).map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))])) };
}

async function fetchForOrigin(origin, destinations, token) {
  // Sequential: Bhuvan's routing server is slow and drops parallel requests.
  const results = [];
  for (const dest of destinations) {
    try { results.push({ dest, ...(await route(origin, dest, token)) }); } catch (err) { results.push({ dest, error: err.message }); }
  }
  const now = new Date().toISOString();
  const events = results.filter((r) => !r.error).map((r) => {
    const detour = r.roadKm / r.straightKm;
    return makeEvent({
      id: `bhuvan-route-${origin.id}-${r.dest.name.replace(/\W+/g, '-')}`,
      type: 'route',
      layer: 'access_routes',
      tag: 'REAL_STATIC',
      sourceUrl: 'https://bhuvan.nrsc.gov.in/',
      title: `Road route ${origin.label} → ${r.dest.name}: ${r.roadKm.toFixed(1)} km`,
      lat: r.dest.lat,
      lng: r.dest.lng,
      timestamp: now,
      severity: r.roadKm > 20 || detour > 1.8 ? 2 : 1,
      source: 'ISRO Bhuvan routing',
      raw: {
        origin: origin.label,
        destination: r.dest.name,
        kind: r.dest.kind,
        road_km: Number(r.roadKm.toFixed(2)),
        straight_line_km: Number(r.straightKm.toFixed(2)),
        detour_ratio: Number(detour.toFixed(2)),
        route_geometry: r.geometry,
        note: 'Road network route from ISRO Bhuvan. Distance only: no live traffic or travel time.',
      },
    });
  });
  return { events, failed: results.filter((r) => r.error).map((r) => `${r.dest.name}: ${r.error}`) };
}

async function fetchBhuvan() {
  const token = config.keys.bhuvanKey;
  if (!token) throw new Error('BHUVAN_KEY not set');
  const destinations = JSON.parse(fs.readFileSync(DESTINATIONS_FILE, 'utf8'));
  if (!destinations.length) throw new Error('no destinations geocoded yet (run scripts/geocode-destinations.js)');

  // Origins sequential too, for the same reason routes within an origin are sequential.
  const perOrigin = [];
  for (const origin of LOCAL_POINTS) perOrigin.push(await fetchForOrigin(origin, destinations, token));

  const events = perOrigin.flatMap((r) => r.events);
  lastStats = Object.fromEntries(LOCAL_POINTS.map((origin, i) => [origin.id, { routed: perOrigin[i].events.length, failed: perOrigin[i].failed }]));
  if (!events.length) throw new Error(`bhuvan: every route failed (${perOrigin.flatMap((r) => r.failed)[0] ?? 'unknown'})`);
  return events;
}

const getBhuvanStats = () => lastStats;

module.exports = { fetchBhuvan, getBhuvanStats };
