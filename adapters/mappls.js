'use strict';

// Mappls (MapmyIndia) Nearby search: the emergency facilities closest to each local centre
// (Amer, Achrol/Amity), plus a reverse-geocoded locality name. The static REST key
// authenticates on search.mappls.com (nearby, rev-geocode, geocode); the older
// apis.mappls.com routing / advancedmaps endpoints reject it, so they are not used.
//
// Nearby results carry name, address, eLoc and road distance but NO coordinates, so one
// event per (origin, facility category) is placed at the query centre - never at a guessed point.

const config = require('../lib/config');
const { fetchJson } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { LOCAL_POINTS } = require('../lib/geo');

const BASE = 'https://search.mappls.com/search';
const CATEGORIES = [
  { id: 'hospital', label: 'hospitals', keywords: 'HLTHSP' }, // Mappls category code: general hospitals (plain "hospital" matches dental clinics)
  { id: 'police', label: 'police stations', keywords: 'police station' },
  { id: 'fire', label: 'fire stations', keywords: 'fire station' },
];
const PER_CATEGORY = 5;

let lastStats = null;

async function nearby(origin, category, key) {
  const url = `${BASE}/places/nearby/json?keywords=${encodeURIComponent(category.keywords)}&refLocation=${origin.lat},${origin.lng}&access_token=${key}`;
  const data = await fetchJson(url);
  return (data?.suggestedLocations ?? []).slice(0, PER_CATEGORY).map((p) => ({
    name: p.placeName,
    address: p.placeAddress,
    distance_m: p.distance,
    eLoc: p.eLoc,
    map_url: p.eLoc ? `https://mappls.com/${p.eLoc}` : null,
  }));
}

async function fetchForOrigin(origin, key) {
  const rev = await fetchJson(`${BASE}/address/rev-geocode?lat=${origin.lat}&lng=${origin.lng}&access_token=${key}`).catch(() => null);
  const place = rev?.results?.[0];
  const locality = [place?.locality, place?.subDistrict].filter(Boolean).join(', ') || origin.label;

  const settled = await Promise.allSettled(CATEGORIES.map((c) => nearby(origin, c, key)));
  const now = new Date().toISOString();
  const events = [];
  settled.forEach((r, i) => {
    const category = CATEGORIES[i];
    if (r.status !== 'fulfilled' || !r.value.length) return;
    const nearest = r.value[0];
    const km = (nearest.distance_m / 1000).toFixed(1);
    events.push(makeEvent({
      id: `mappls-${origin.id}-${category.id}`,
      type: 'event',
      layer: 'pois',
      tag: 'REAL_STATIC',
      sourceUrl: nearest.map_url ?? 'https://www.mappls.com/',
      title: `Nearest ${category.label} to ${locality}: ${nearest.name} (${km} km)`,
      lat: origin.lat,
      lng: origin.lng,
      timestamp: now,
      // A long way to the nearest hospital / fire station is itself a risk factor.
      severity: nearest.distance_m > 5000 ? 3 : nearest.distance_m > 2000 ? 2 : 1,
      source: 'Mappls (MapmyIndia)',
      raw: {
        origin: origin.label,
        category: category.id,
        locality,
        pincode: place?.pincode ?? null,
        facilities: r.value,
        note: 'Mappls POI directory (distances from the local centre). Pin sits at the query centre; Mappls Nearby does not return facility coordinates.',
      },
    }));
  });
  return { locality, events, categories: Object.fromEntries(CATEGORIES.map((c, i) => [c.id, settled[i].status === 'fulfilled' ? settled[i].value.length : `error: ${settled[i].reason?.message}`])) };
}

async function fetchMappls() {
  const key = config.keys.mapplsApiKey;
  if (!key) throw new Error('MAPPLS_API_KEY not set');

  const results = await Promise.all(LOCAL_POINTS.map((origin) => fetchForOrigin(origin, key)));
  const events = results.flatMap((r) => r.events);
  lastStats = Object.fromEntries(LOCAL_POINTS.map((origin, i) => [origin.id, { locality: results[i].locality, categories: results[i].categories }]));
  if (!events.length) throw new Error('mappls: no origin returned results');
  return events;
}

const getMapplsStats = () => lastStats;

module.exports = { fetchMappls, getMapplsStats };
