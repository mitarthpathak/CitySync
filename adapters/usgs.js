'use strict';

const { fetchJson } = require('../lib/http');
const { makeEvent } = require('../lib/event');

const URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

function severityFromMagnitude(mag) {
  if (typeof mag !== 'number') return 1; // unreviewed quake without a magnitude: info only
  if (mag < 3) return 2;
  if (mag < 4) return 3;
  if (mag < 5) return 4;
  return 5;
}

function toEvent(feature) {
  const { properties = {}, geometry } = feature;
  const [lng, lat, depthKm] = geometry.coordinates;
  const magnitude = typeof properties.mag === 'number' ? properties.mag : null;

  return makeEvent({
    id: `usgs-${feature.id ?? `${properties.time}-${lat}-${lng}`}`,
    type: 'earthquake',
    title: properties.place || `Earthquake${magnitude === null ? '' : ` M${magnitude}`}`,
    lat,
    lng,
    timestamp: new Date(properties.time).toISOString(),
    severity: severityFromMagnitude(magnitude),
    source: 'USGS',
    isSimulated: false,
    raw: { magnitude, depthKm },
    sourceUrl: typeof properties.url === 'string' ? properties.url : null,
  });
}

/** Real earthquakes from the last 24h, worldwide. Keyless. */
async function fetchUsgs() {
  const data = await fetchJson(URL);
  if (!Array.isArray(data?.features)) {
    throw new Error('unexpected payload: no "features" array');
  }

  const events = [];
  let skipped = 0;
  for (const feature of data.features) {
    try {
      events.push(toEvent(feature));
    } catch {
      skipped += 1; // one malformed feature must not drop the other few hundred
    }
  }
  if (skipped) console.warn(`[usgs] skipped ${skipped} malformed feature(s)`);
  return events;
}

module.exports = { fetchUsgs };
