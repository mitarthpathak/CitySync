'use strict';
const fs = require('fs');
const path = require('path');
const wards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'public', 'data', 'jaipur-wards.geojson'), 'utf8'));
function ringContains(ring, lng, lat) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i]; const [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
function contains(feature, lng, lat) { const g = feature.geometry; const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return polygons.some((poly) => ringContains(poly[0], lng, lat)); }
function wardAt(lat, lng) { return wards.features.find((f) => contains(f, lng, lat)) || null; }
function getWard(id) { return wards.features.find((f) => f.properties.ward_id === String(id)) || null; }
module.exports = { wards, wardAt, getWard };
