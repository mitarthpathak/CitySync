'use strict';

// JCTSL-PTAL: public-transport accessibility per Jaipur ward, from the community research
// dataset (github.com/SoniAnmol/JCTSL-PTAL). Static import only - refreshed by
// scripts/fetch-jctsl-ptal.js; this adapter just reads the committed JSON. Tagged
// REAL_STATIC: real published analysis, not a live transit feed.
//
// accessibility_cat is the dataset's own tertile (1 = lowest access, 3 = highest).
// Low access in a dense ward is the gap worth surfacing, so severity rises with both.

const fs = require('fs');
const path = require('path');
const { makeEvent } = require('../lib/event');

const FILE = path.join(__dirname, '..', 'data', 'jctsl-ptal.json');
const DENSE_PER_SQ_KM = 10000;

function fetchJctslPtal() {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!data.updatedAt || !data.wards?.length) throw new Error('JCTSL-PTAL import has not been built yet (run scripts/fetch-jctsl-ptal.js)');
  const labels = { 1: 'low', 2: 'medium', 3: 'high' };
  return data.wards.map((w) => {
    const level = labels[w.min_accessibility_cat] ?? 'unknown';
    const dense = w.mean_pop_density_per_sq_km >= DENSE_PER_SQ_KM;
    return makeEvent({
      id: `ptal-${w.ward_id}`,
      type: 'transit',
      layer: 'transit',
      tag: 'REAL_STATIC',
      sourceUrl: data.sourceUrl,
      ward_id: w.ward_id,
      title: `Public transport access: ${level} in ${w.ward_name}`,
      lat: w.lat,
      lng: w.lng,
      timestamp: data.updatedAt,
      severity: w.min_accessibility_cat === 1 ? (dense ? 3 : 2) : 1,
      source: 'JCTSL-PTAL',
      raw: {
        accessibility_level: level,
        mean_accessibility_index: w.mean_accessibility_index,
        grid_cells: w.cell_count,
        mean_pop_density_per_sq_km: w.mean_pop_density_per_sq_km,
        nearest_stops: w.nearest_stops,
        note: data.note,
      },
    });
  });
}

module.exports = { fetchJctslPtal };
