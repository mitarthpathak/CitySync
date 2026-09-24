'use strict';

// One-time build helper.  This intentionally has no runtime dependency: it turns the
// public-domain OpenCity KML into the file served by the API and Leaflet.
const fs = require('fs');
const path = require('path');
const input = path.join(__dirname, 'jaipur-wards-2024.kml');
const output = path.join(__dirname, '..', 'frontend', 'public', 'data', 'jaipur-wards.geojson');
const xml = fs.readFileSync(input, 'utf8');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const data = (block, name) => decode((block.match(new RegExp(`<SimpleData name="${name}">([\\s\\S]*?)<\\/SimpleData>`)) || [])[1] || '').trim();
const ring = (text) => text.trim().split(/\s+/).map((point) => point.split(',').slice(0, 2).map(Number)).filter((p) => p.every(Number.isFinite));
const features = [...xml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)].map((match) => {
  const block = match[1];
  const polygons = [...block.matchAll(/<Polygon>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Polygon>/g)].map((m) => [ring(m[1])]).filter((r) => r[0].length >= 4);
  const wardId = data(block, 'wardcode') || data(block, 'objectid');
  const wardName = data(block, 'ward_lgd_name') || `Ward ${wardId}`;
  return { type: 'Feature', properties: { ward_id: String(wardId), ward_name: wardName, official: true, attribution: 'OpenCity.in — Jaipur Municipal Corporation Wards Map' }, geometry: polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons } };
}).filter((f) => f.geometry.coordinates.length);
features.push({ type: 'Feature', properties: { ward_id: 'amer-custom', ward_name: 'Amer custom zone (not an official ward)', official: false, attribution: 'CityPulse custom zone' }, geometry: { type: 'Polygon', coordinates: [[[75.828,26.972],[75.874,26.972],[75.874,27.005],[75.828,27.005],[75.828,26.972]]] } });
fs.writeFileSync(output, JSON.stringify({ type: 'FeatureCollection', name: 'Greater Jaipur Nagar Nigam Wards 2024 plus Amer custom zone', attribution: 'OpenCity.in — Jaipur Municipal Corporation Wards Map', sourceUrl: 'https://data.opencity.in/dataset/jaipur-municipal-corporation-wards-map', features }, null, 2));
console.log(`Wrote ${features.length} features to ${output}`);
