'use strict';

// One-time/periodic static import of the JCTSL-PTAL community dataset (no key):
// https://github.com/SoniAnmol/JCTSL-PTAL
//   - data/ai/ai_jctsl_cat.csv: public-transport accessibility per ~1 km hex cell (bus +
//     metro PTAL, nearest JCTSL stop, walking distance, population density)
//     -> data/jctsl-ptal.json (cells + per-ward summary on our ward polygons)
//   - data/routes/route_*.geojson (UTM zone 43N) -> WGS84, thinned
//     -> frontend/public/data/jctsl-routes.geojson (map overlay)
const fs = require('fs');
const path = require('path');
const { wardAt } = require('../lib/wards');

const REPO = 'SoniAnmol/JCTSL-PTAL';
const RAW = `https://raw.githubusercontent.com/${REPO}/HEAD`;
const PTAL_OUT = path.join(__dirname, '..', 'data', 'jctsl-ptal.json');
const ROUTES_OUT = path.join(__dirname, '..', 'frontend', 'public', 'data', 'jctsl-routes.geojson');

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': 'CitySync build script' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return as === 'json' ? res.json() : res.text();
}

/** Minimal RFC 4180 CSV parser (quoted fields may contain commas). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

/** UTM (WGS84, northern hemisphere) -> [lng, lat]. Standard series inversion (Snyder). */
function utmToLngLat(easting, northing, zone = 43) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const x = easting - 500000;
  const m = northing / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = ep2 * Math.cos(phi1) ** 2;
  const r1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const d = x / (n1 * k0);
  const lat = phi1 - ((n1 * Math.tan(phi1)) / r1) * (d ** 2 / 2
    - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4) / 24
    + ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6) / 720);
  const lng = (d - ((1 + 2 * t1 + c1) * d ** 3) / 6
    + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5) / 120) / Math.cos(phi1);
  const lng0 = (zone - 1) * 6 - 180 + 3;
  return [Number((lng0 + (lng * 180) / Math.PI).toFixed(5)), Number(((lat * 180) / Math.PI).toFixed(5))];
}

const num = (v) => (v === '' || v == null ? null : Number(v));
const pointOf = (wkt) => { const m = /POINT \(([-\d.]+) ([-\d.]+)\)/.exec(wkt); return m ? { lng: Number(m[1]), lat: Number(m[2]) } : null; };

async function importPtal() {
  const rows = parseCsv(await get(`${RAW}/data/ai/ai_jctsl_cat.csv`));
  const cells = [];
  for (const r of rows) {
    const p = pointOf(r.POI);
    if (!p) continue;
    const ward = wardAt(p.lat, p.lng);
    cells.push({
      lat: Number(p.lat.toFixed(5)),
      lng: Number(p.lng.toFixed(5)),
      accessibility_index: num(r.accessibility_index),
      accessibility_cat: num(r.accessibility_cat),
      bivariate_cat: r.bivariate_cat || null,
      bus_ptal: num(r.bus_ptal),
      metro_ptal: num(r.metro_ptal),
      pop_density_per_sq_km: num(r.population_density ?? r.pop_density_per_sq_km),
      nearest_stop: r.sap_name || null,
      routes: r.routes ? r.routes.split(',').map((s) => s.trim()).filter(Boolean) : [],
      walking_distance_m: num(r.walking_distance),
      ward_id: ward?.properties.ward_id ?? null,
      ward_name: ward?.properties.ward_name ?? null,
    });
  }
  const byWard = new Map();
  for (const c of cells) {
    if (!c.ward_id || !Number.isFinite(c.accessibility_index)) continue;
    const w = byWard.get(c.ward_id) ?? { ward_id: c.ward_id, ward_name: c.ward_name, cells: [] };
    w.cells.push(c);
    byWard.set(c.ward_id, w);
  }
  const wardsOut = [...byWard.values()].map(({ cells: cs, ...w }) => ({
    ...w,
    cell_count: cs.length,
    mean_accessibility_index: Number((cs.reduce((a, c) => a + c.accessibility_index, 0) / cs.length).toFixed(3)),
    min_accessibility_cat: Math.min(...cs.map((c) => c.accessibility_cat ?? Infinity)),
    mean_pop_density_per_sq_km: Math.round(cs.reduce((a, c) => a + (c.pop_density_per_sq_km ?? 0), 0) / cs.length),
    nearest_stops: [...new Set(cs.map((c) => c.nearest_stop).filter(Boolean))].slice(0, 5),
    lat: Number((cs.reduce((a, c) => a + c.lat, 0) / cs.length).toFixed(5)),
    lng: Number((cs.reduce((a, c) => a + c.lng, 0) / cs.length).toFixed(5)),
  }));
  fs.mkdirSync(path.dirname(PTAL_OUT), { recursive: true });
  fs.writeFileSync(PTAL_OUT, JSON.stringify({
    updatedAt: new Date().toISOString(),
    source: 'JCTSL-PTAL (Soni, community dataset)',
    sourceUrl: `https://github.com/${REPO}`,
    note: 'Static research dataset (PTAL per ~1 km grid, JCTSL bus + metro). Not a live transit feed.',
    cells,
    wards: wardsOut,
  }));
  console.log(`JCTSL-PTAL: ${cells.length} grid cells, ${wardsOut.length} wards -> ${PTAL_OUT}`);
}

function toLines(geojson) {
  if (!geojson) return [];
  if (geojson.type === 'FeatureCollection') return geojson.features.flatMap((f) => toLines(f.geometry));
  if (geojson.type === 'Feature') return toLines(geojson.geometry);
  if (geojson.type === 'LineString') return [geojson.coordinates];
  if (geojson.type === 'MultiLineString') return geojson.coordinates;
  return [];
}

async function importRoutes() {
  const tree = await get(`https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`, 'json');
  const files = tree.tree.map((t) => t.path).filter((p) => /^data\/routes\/route_.+\.geojson$/.test(p));
  const features = [];
  for (const file of files) {
    const route = file.match(/route_(.+)\.geojson$/)[1];
    for (const line of toLines(await get(`${RAW}/${file}`, 'json'))) {
      const projected = Math.abs(line[0]?.[0] ?? 0) > 180; // metres (UTM 43N), not degrees
      const coords = line.map(([x, y]) => (projected ? utmToLngLat(x, y) : [x, y]));
      const step = Math.max(1, Math.floor(coords.length / 200)); // thin to ~200 points per line
      const thinned = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
      if (thinned.length > 1) features.push({ type: 'Feature', properties: { route }, geometry: { type: 'LineString', coordinates: thinned } });
    }
  }
  fs.mkdirSync(path.dirname(ROUTES_OUT), { recursive: true });
  fs.writeFileSync(ROUTES_OUT, JSON.stringify({ type: 'FeatureCollection', attribution: 'JCTSL-PTAL (github.com/SoniAnmol/JCTSL-PTAL)', features }));
  console.log(`JCTSL routes: ${files.length} routes, ${features.length} line(s) -> ${ROUTES_OUT}`);
}

(async () => {
  await importPtal();
  await importRoutes();
})().catch((err) => {
  console.error(`JCTSL-PTAL import failed: ${err.message}`);
  process.exit(1);
});
