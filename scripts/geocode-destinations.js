'use strict';

// One-time, polite Nominatim build helper for the Bhuvan access-route adapter's
// destinations. Only writes coordinates Nominatim returned; failures are omitted.
const fs = require('fs');
const path = require('path');

const DESTINATIONS = [
  { name: 'SMS Hospital', kind: 'hospital', query: 'Sawai Man Singh Hospital, Jaipur' },
  { name: 'Jaipur Junction', kind: 'railway', query: 'Jaipur Junction railway station' },
  { name: 'Jaipur International Airport', kind: 'airport', query: 'Jaipur International Airport' },
  { name: 'Sindhi Camp Bus Stand', kind: 'bus', query: 'Sindhi Camp Bus Stand, Jaipur' },
];
const output = path.join(__dirname, '..', 'data', 'access-destinations.json');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const results = [];
  for (const d of DESTINATIONS) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(d.query)}`;
      const found = await (await fetch(url, { headers: { 'User-Agent': 'CitySync build contact: local-project' } })).json();
      if (found[0] && Number.isFinite(Number(found[0].lat))) results.push({ name: d.name, kind: d.kind, lat: Number(found[0].lat), lng: Number(found[0].lon), geocoder: 'Nominatim (one-time build cache)' });
      else console.warn(`not found: ${d.query}`);
    } catch (err) {
      console.warn(`failed: ${d.query} (${err.message})`);
    }
    await sleep(1100);
  }
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  console.log(`Geocoded ${results.length}/${DESTINATIONS.length} destinations -> ${output}`);
})();
