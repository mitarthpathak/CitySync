'use strict';

// Mappls (MapmyIndia) Nearby search: the emergency facilities closest to the local centre
// (Amer), plus a reverse-geocoded locality name. The static REST key authenticates on
// search.mappls.com (nearby, rev-geocode, geocode); the older apis.mappls.com routing /
// advancedmaps endpoints reject it, so they are not used.
//
// Nearby results carry name, address, eLoc and road distance but NO coordinates, so one
// event per facility category is placed at the query centre - never at a guessed point.

const config = require('../lib/config');
const { fetchJson } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { AMER } = require('../lib/geo');

const BASE = 'https://search.mappls.com/search';
const CATEGORIES = [
  { id: 'hospital', label: 'hospitals', keywords: 'HLTHSP' }, // Mappls category code: general hospitals (plain "hospital" matches dental clinics)
  { id: 'police', label: 'police stations', keywords: 'police station' },
  { id: 'fire', label: 'fire stations', keywords: 'fire station' },
];
const PER_CATEGORY = 5;

let lastStats = null;

async function nearby(category, key) {
  const url = `${BASE}/places/nearby/json?keywords=${encodeURIComponent(category.keywords)}&refLocation=${AMER.lat},${AMER.lng}&access_token=${key}`;
  const data = await fetchJson(url);
  return (data?.suggestedLocations ?? []).slice(0, PER_CATEGORY).map((p) => ({
    name: p.placeName,
    address: p.placeAddress,
    distance_m: p.distance,
    eLoc: p.eLoc,
    map_url: p.eLoc ? `https://mappls.com/${p.eLoc}` : null,
  }));
}

async function fetchMappls() {
  const key = config.keys.mapplsApiKey;
  if (!key) throw new Error('MAPPLS_API_KEY not set');

  const rev = await fetchJson(`${BASE}/address/rev-geocode?lat=${AMER.lat}&lng=${AMER.lng}&access_token=${key}`).catch(() => null);
  const place = rev?.results?.[0];
  const locality = [place?.locality, place?.subDistrict].filter(Boolean).join(', ') || 'Amer';

  const settled = await Promise.allSettled(CATEGORIES.map((c) => nearby(c, key)));
  const now = new Date().toISOString();
  const events = [];
  settled.forEach((r, i) => {
    const category = CATEGORIES[i];
    if (r.status !== 'fulfilled' || !r.value.length) return;
    const nearest = r.value[0];
    const km = (nearest.distance_m / 1000).toFixed(1);
    events.push(makeEvent({
      id: `mappls-${category.id}-${AMER.lat}-${AMER.lng}`,
      type: 'event',
      layer: 'pois',
      tag: 'REAL_STATIC',
      sourceUrl: nearest.map_url ?? 'https://www.mappls.com/',
      title: `Nearest ${category.label} to ${locality}: ${nearest.name} (${km} km)`,
      lat: AMER.lat,
      lng: AMER.lng,
      timestamp: now,
      // A long way to the nearest hospital / fire station is itself a risk factor.
      severity: nearest.distance_m > 5000 ? 3 : nearest.distance_m > 2000 ? 2 : 1,
      source: 'Mappls (MapmyIndia)',
      raw: {
        category: category.id,
        locality,
        pincode: place?.pincode ?? null,
        facilities: r.value,
        note: 'Mappls POI directory (distances from the local centre). Pin sits at the query centre; Mappls Nearby does not return facility coordinates.',
      },
    }));
  });
  lastStats = { locality, categories: Object.fromEntries(CATEGORIES.map((c, i) => [c.id, settled[i].status === 'fulfilled' ? settled[i].value.length : `error: ${settled[i].reason?.message}`])) };
  if (!events.length) throw new Error(`mappls: no category returned results (${settled.map((r) => r.reason?.message).filter(Boolean)[0] ?? 'empty'})`);
  return events;
}

const getMapplsStats = () => lastStats;

module.exports = { fetchMappls, getMapplsStats };
