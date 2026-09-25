'use strict';

// WorldPop 2020 population per Jaipur ward (CC BY 4.0, no key). Static import only -
// refreshed by scripts/fetch-worldpop.js; this adapter just reads the committed JSON.
// Replaces any census API dependency. Tagged REAL_STATIC: modelled-from-census gridded
// population, not a live count.

const fs = require('fs');
const path = require('path');
const { makeEvent } = require('../lib/event');

const FILE = path.join(__dirname, '..', 'data', 'jaipur-ward-population.json');

function fetchWorldPop() {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!data.updatedAt || !data.wards?.length) throw new Error('WorldPop import has not been built yet (run scripts/fetch-worldpop.js)');
  return data.wards.map((w) => makeEvent({
    id: `population-${w.ward_id}`,
    type: 'exposure',
    layer: 'exposure',
    tag: 'REAL_STATIC',
    sourceUrl: 'https://www.worldpop.org/',
    ward_id: w.ward_id,
    title: `Population ~${w.population.toLocaleString('en-IN')} in ${w.ward_name}`,
    lat: w.lat,
    lng: w.lng,
    timestamp: data.updatedAt,
    severity: w.population >= 50000 ? 3 : w.population >= 20000 ? 2 : 1,
    source: 'WorldPop',
    raw: {
      population: w.population,
      pixels_1km: w.pixels,
      dataset: data.source,
      license: data.license,
      method: data.method,
    },
  }));
}

module.exports = { fetchWorldPop };
