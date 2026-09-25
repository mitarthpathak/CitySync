'use strict';

const config = require('../lib/config');
const { fetchJson } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const H = require('../lib/heuristics');

const JAIPUR_POINTS = [
  ['Amer Fort Road', 26.9855, 75.8513],
  ['Delhi Road', 26.9483, 75.8378],
  ['Tonk Road', 26.8707, 75.793],
  ['JLN Marg', 26.862, 75.816],
  ['Ajmer Road', 26.914, 75.744],
  ['C-Scheme', 26.9095, 75.8014],
  ['Gopalpura', 26.861, 75.789],
  ['Murlipura', 27.03, 75.78],
];

// A handful of world cities get an incidents bbox too - flow segments need a point per
// road, which doesn't generalise past Jaipur, but incidents just need a bounding box.
const WORLD_INCIDENT_CITIES = [
  ['Delhi', 28.6139, 77.209],
  ['Tokyo', 35.6762, 139.6503],
  ['London', 51.5074, -0.1278],
  ['New York', 40.7128, -74.006],
  ['São Paulo', -23.5505, -46.6333],
  ['Cairo', 30.0444, 31.2357],
];
const CITY_BBOX_DEG = 0.15; // ~15 km half-width around a city center

// TomTom's free tier is 2,500 requests/day. This process is the only caller (the
// background scheduler; a frontend request never reaches this file), so a simple
// in-memory, UTC-day counter is enough to stay well under the cap.
let requestCount = 0;
let countDay = null;
function trackRequest() {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== countDay) { countDay = day; requestCount = 0; }
  requestCount += 1;
  return requestCount <= config.tomtom.dailyRequestCap;
}

async function fetchFlow(key, name, lat, lng) {
  if (!trackRequest()) return null;
  const d = await fetchJson(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${encodeURIComponent(key)}&point=${lat},${lng}`);
  const f = d.flowSegmentData;
  if (!f) return null;
  const ratio = f.currentSpeed / Math.max(1, f.freeFlowSpeed);
  return makeEvent({
    id: `tomtom-flow-${name.replace(/\W/g, '-')}-${Date.now()}`,
    type: 'traffic',
    layer: 'traffic',
    tag: 'REAL_LIVE',
    sourceUrl: 'https://developer.tomtom.com/',
    title: `${name}: ${f.currentSpeed} km/h traffic flow`,
    lat, lng,
    timestamp: new Date().toISOString(),
    severity: ratio < 0.35 ? 5 : ratio < 0.55 ? 4 : ratio < 0.75 ? 3 : 2,
    source: 'TomTom Traffic',
    raw: { current_speed_kmh: f.currentSpeed, free_flow_speed_kmh: f.freeFlowSpeed, confidence: f.confidence },
  });
}

async function fetchIncidents(key, label, bbox) {
  if (!trackRequest()) return [];
  const fields = '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description}}}}';
  const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox}&fields=${encodeURIComponent(fields)}&key=${encodeURIComponent(key)}`;
  const d = await fetchJson(url);
  const incidents = Array.isArray(d?.incidents) ? d.incidents : [];
  return incidents.map((inc, i) => {
    const [lng, lat] = inc.geometry?.coordinates?.[0] ?? inc.geometry?.coordinates ?? [];
    const description = inc.properties?.events?.[0]?.description ?? 'Traffic incident';
    const delay = Number(inc.properties?.magnitudeOfDelay) || 0;
    return makeEvent({
      id: `tomtom-incident-${label.replace(/\W/g, '-')}-${i}-${Date.now()}`,
      type: 'traffic',
      layer: 'traffic',
      tag: 'REAL_LIVE',
      sourceUrl: 'https://developer.tomtom.com/',
      title: `${label}: ${description}`,
      lat: Number.isFinite(lat) ? lat : 0,
      lng: Number.isFinite(lng) ? lng : 0,
      timestamp: new Date().toISOString(),
      severity: Math.min(5, Math.max(2, delay + 1)),
      source: 'TomTom Traffic Incidents',
      raw: { category: inc.properties?.iconCategory ?? null, magnitudeOfDelay: delay },
    });
  }).filter((e) => e.lat !== 0 || e.lng !== 0);
}

async function fetchTomTom() {
  const key = config.keys.tomtomKey;
  if (!key) {
    const err = new Error('TOMTOM_KEY not configured');
    err.disabled = true;
    throw err;
  }
  const b = H.jaipurBounds;
  const jaipurBbox = `${b.west},${b.south},${b.east},${b.north}`;

  const flowSettled = await Promise.allSettled(JAIPUR_POINTS.map(([name, lat, lng]) => fetchFlow(key, name, lat, lng)));
  const jaipurIncidents = await fetchIncidents(key, 'Jaipur', jaipurBbox).catch(() => []);
  const worldIncidents = await Promise.allSettled(
    WORLD_INCIDENT_CITIES.map(([name, lat, lng]) => {
      const bbox = `${lng - CITY_BBOX_DEG},${lat - CITY_BBOX_DEG},${lng + CITY_BBOX_DEG},${lat + CITY_BBOX_DEG}`;
      return fetchIncidents(key, name, bbox);
    }),
  );

  const flowEvents = flowSettled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  const worldIncidentEvents = worldIncidents.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  return [...flowEvents, ...jaipurIncidents, ...worldIncidentEvents];
}

const getTomTomStats = () => ({ requestsToday: requestCount, dailyRequestCap: config.tomtom.dailyRequestCap });

module.exports = { fetchTomTom, getTomTomStats };
