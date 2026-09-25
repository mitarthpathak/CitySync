'use strict';

// One-time/periodic static import: WorldPop 2020 India population (1 km, UN-adjusted,
// CC BY 4.0, no key) aggregated to Jaipur ward polygons -> data/jaipur-ward-population.json.
// Downloads the 18 MB national GeoTIFF once and decodes only the Jaipur window. Each pixel is assigned to the ward containing its
// centre (no partial-pixel weighting), so ward totals are approximate at ward edges.
const fs = require('fs');
const path = require('path');
const { wards, wardAt } = require('../lib/wards');

const RASTER_URL = 'https://data.worldpop.org/GIS/Population/Global_2000_2020_1km_UNadj/2020/IND/ind_ppp_2020_1km_Aggregated_UNadj.tif';
const OUTPUT = path.join(__dirname, '..', 'data', 'jaipur-ward-population.json');

function wardsBbox() {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c) => (typeof c[0] === 'number' ? ([west, south, east, north] = [Math.min(west, c[0]), Math.min(south, c[1]), Math.max(east, c[0]), Math.max(north, c[1])]) : c.forEach(visit));
  for (const f of wards.features) visit(f.geometry.coordinates);
  return { west, south, east, north };
}

(async () => {
  const { fromArrayBuffer } = await import('geotiff');
  // WorldPop's server ignores range requests, so fetch the whole file once and decode in memory.
  const res = await fetch(RASTER_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${RASTER_URL}`);
  const tiff = await fromArrayBuffer(await res.arrayBuffer());
  const image = await tiff.getImage();
  const [originX, originY] = image.getOrigin();
  const [resX, resY] = image.getResolution(); // resY is negative (north-up)
  const noData = image.getGDALNoData();

  const bbox = wardsBbox();
  const x0 = Math.floor((bbox.west - originX) / resX);
  const x1 = Math.ceil((bbox.east - originX) / resX);
  const y0 = Math.floor((bbox.north - originY) / resY);
  const y1 = Math.ceil((bbox.south - originY) / resY);
  const [band] = await image.readRasters({ window: [x0, y0, x1, y1] });
  const width = x1 - x0;

  const totals = new Map();
  for (let i = 0; i < band.length; i += 1) {
    const value = band[i];
    if (!Number.isFinite(value) || value <= 0 || value === noData) continue;
    const lng = originX + (x0 + (i % width) + 0.5) * resX;
    const lat = originY + (y0 + Math.floor(i / width) + 0.5) * resY;
    const ward = wardAt(lat, lng);
    if (!ward) continue;
    const id = ward.properties.ward_id;
    const t = totals.get(id) ?? { ward_id: id, ward_name: ward.properties.ward_name, population: 0, pixels: 0, latSum: 0, lngSum: 0 };
    t.population += value;
    t.pixels += 1;
    t.latSum += lat;
    t.lngSum += lng;
    totals.set(id, t);
  }

  const rows = [...totals.values()].map(({ latSum, lngSum, ...t }) => ({
    ...t,
    population: Math.round(t.population),
    lat: Number((latSum / t.pixels).toFixed(5)),
    lng: Number((lngSum / t.pixels).toFixed(5)),
  }));
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({
    updatedAt: new Date().toISOString(),
    source: 'WorldPop 2020, 1 km UN-adjusted (ind_ppp_2020_1km_Aggregated_UNadj)',
    sourceUrl: RASTER_URL,
    license: 'CC BY 4.0 - WorldPop (www.worldpop.org)',
    method: 'Sum of 1 km pixels whose centre falls inside each ward polygon (approximate at ward edges).',
    wards: rows,
  }, null, 2));
  console.log(`WorldPop: ${rows.length}/${wards.features.length} wards, total ${rows.reduce((a, r) => a + r.population, 0).toLocaleString()} people -> ${OUTPUT}`);
})().catch((err) => {
  console.error(`WorldPop import failed: ${err.message}`);
  process.exit(1);
});
