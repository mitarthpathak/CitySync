'use strict';

// One-time, polite Nominatim build helper. It only writes coordinates returned by
// Nominatim; failures are omitted rather than replaced with guessed points.
const fs = require('fs');
const path = require('path');
const input = path.join(__dirname, 'waterlogging-hotspots.json');
const output = path.join(__dirname, '..', 'data', 'places.json');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const rows = JSON.parse(fs.readFileSync(input, 'utf8'));
  const results = [];
  for (const row of rows) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(`${row.name}, Jaipur, Rajasthan, India`)}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'CitySync build contact: local-project' } });
      const found = await response.json();
      if (found[0] && Number.isFinite(Number(found[0].lat)) && Number.isFinite(Number(found[0].lon))) results.push({ ...row, lat: Number(found[0].lat), lng: Number(found[0].lon), geocoder: 'Nominatim (one-time build cache)' });
    } catch (_) { /* skipped by design */ }
    await sleep(1100);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  console.log(`Geocoded ${results.length}/${rows.length} hotspots`);
})();
