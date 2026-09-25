'use strict';

const config = require('../lib/config');
const { fetchJson } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { wardAt } = require('../lib/wards');
const H = require('../lib/heuristics');
const WORLD_CITIES = require('../config/world-cities');

// Station coordinates are the published Jaipur monitoring locations; WAQI supplies the
// measurement. `ward: true` marks the ones inside Jaipur (looked up per-point below).
const JAIPUR_STATIONS = [
  { name: 'RIICO Sitapura', lat: 26.785, lng: 75.826 },
  { name: 'Sector-2 Murlipura', lat: 27.033, lng: 75.781 },
  { name: 'Mansarovar Sector-12', lat: 26.856, lng: 75.762 },
  { name: 'Adarsh Nagar', lat: 26.901, lng: 75.824 },
  { name: 'Police Commissionerate', lat: 26.916, lng: 75.814 },
  { name: 'Shastri Nagar', lat: 26.941, lng: 75.779 },
];

// GLOBAL: measured station AQI for a slice of the world city grid too, not just the
// modelled reading cityAq already provides - kept to ~12 cities so one refresh cycle
// stays a reasonable number of requests against a free WAQI token.
const WORLD_STATION_NAMES = ['Delhi', 'Beijing', 'Tokyo', 'London', 'Cairo', 'New York', 'São Paulo', 'Bangkok', 'Lagos', 'Mexico City', 'Moscow', 'Sydney'];
const WORLD_STATIONS = WORLD_CITIES.filter((c) => WORLD_STATION_NAMES.includes(c.name));

async function fetchStation(station) {
  const token = config.keys.waqiToken;
  const q = encodeURIComponent(`${station.lat};${station.lng}`);
  // The ground reading is the whole point of this source; the model comparison below is
  // a best-effort enrichment - its failure must never cost the station its real reading.
  const waqi = await fetchJson(`https://api.waqi.info/feed/geo:${q}/?token=${encodeURIComponent(token)}`);
  const aqi = waqi?.data?.aqi;
  if (!Number.isFinite(aqi)) return null;
  const modelAqi = await fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${station.lat}&longitude=${station.lng}&current=us_aqi`)
    .then((m) => m?.current?.us_aqi)
    .catch(() => null);
  // The gap between a real ground reading and the model is surfaced, not hidden - a
  // station reading far from what the model expects is exactly the interesting case.
  const gap = Number.isFinite(modelAqi) ? Math.abs(aqi - modelAqi) : null;
  const lowConfidence = gap !== null && gap > H.aqi.lowConfidenceGap;
  const ward = wardAt(station.lat, station.lng);
  return makeEvent({
    id: `waqi-${station.name.replace(/\W/g, '-')}-${waqi.data.time?.s || Date.now()}`,
    type: 'air_quality',
    layer: 'aqi_station',
    tag: 'REAL_LIVE',
    sourceUrl: 'https://aqicn.org/',
    ward_id: ward?.properties.ward_id ?? null,
    title: `${station.name}: AQI ${aqi}${lowConfidence ? ' (low confidence)' : ''}`,
    lat: station.lat,
    lng: station.lng,
    timestamp: waqi.data.time?.iso || new Date().toISOString(),
    severity: aqi > 200 ? 5 : aqi > 150 ? 4 : aqi > 100 ? 3 : aqi > 50 ? 2 : 1,
    source: 'WAQI ground station',
    raw: {
      station: station.name,
      measured_aqi: aqi,
      modelled_aqi: modelAqi ?? null,
      model_gap: gap,
      confidence: lowConfidence ? 'low' : 'normal',
      note: 'Measured station AQI compared with Open-Meteo model.',
    },
  });
}

async function fetchWaqi() {
  if (!config.keys.waqiToken) {
    const err = new Error('WAQI_TOKEN not configured');
    err.disabled = true;
    throw err;
  }
  const stations = [...JAIPUR_STATIONS, ...WORLD_STATIONS];
  const settled = await Promise.allSettled(stations.map(fetchStation));
  const events = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  // Zero successful stations is a real failure (e.g. no network), not "0 readings right
  // now" - throw so it falls back to mock/down instead of reporting a misleading "live".
  if (!events.length) throw new Error('waqi: no station returned a usable reading');
  return events;
}

module.exports = { fetchWaqi, JAIPUR_STATIONS, WORLD_STATIONS };
