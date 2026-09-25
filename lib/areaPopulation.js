'use strict';

// People living inside an alert's polygon, from WorldPop's global 2020 constrained
// 100 m population grid (CC BY 4.0, keyless). One lookup takes 3-8 s, so results are cached
// on disk per polygon (alert areas repeat day after day) and a refresh only computes a
// few new ones: coverage fills in over a few refresh cycles instead of stalling the feed.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = 'https://api.worldpop.org/v1/services/stats?dataset=wpgppop&year=2020&runasync=false';
const CACHE_FILE = path.join(__dirname, '..', 'data', 'alert-area-population.json');
const MAX_URL = 7500; // stay well under common proxy/server URL length limits
const MAX_PARTS = 5; // a MultiPolygon with more disjoint rings than this is skipped - too fragmented to be worth 5-8s/part

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
} catch {
  cache = {};
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch (err) {
    console.warn(`[population] cache not saved: ${err.message}`);
  }
}

/** Stable id for a geometry - rounded coords, so the same shape always hashes the same. */
function hashOf(geometry) {
  const rounded = JSON.stringify(geometry.coordinates, (_, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v));
  return crypto.createHash('sha1').update(rounded).digest('hex').slice(0, 16);
}

/**
 * One request body per polygon part (the API answers a MultiPolygon with no `data` at all -
 * verified against the live service). Coordinates are rounded to 3 decimals (~100 m, the
 * grid's own resolution) and rings are thinned until each request fits in a URL.
 * Returns an array of Polygon GeoJSON strings, or null when the shape can't be sent.
 */
function compact(geometry) {
  const parts = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  if (parts.length > MAX_PARTS) return null;
  const bodies = [];
  for (const rings of parts) {
    let body = null;
    for (let step = 1; step <= 64 && !body; step *= 2) {
      const outer = rings[0].filter((_, i) => i % step === 0);
      if (outer.length < 3) break;
      outer.push(outer[0]);
      const json = JSON.stringify({ type: 'Polygon', coordinates: [outer.map(([x, y]) => [Number(x.toFixed(3)), Number(y.toFixed(3))])] });
      if (API.length + encodeURIComponent(json).length <= MAX_URL) body = json;
    }
    if (!body) return null;
    bodies.push(body);
  }
  return bodies;
}

async function fetchOnePolygon(geojson) {
  const res = await fetch(`${API}&geojson=${encodeURIComponent(geojson)}`, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const total = body?.data?.total_population;
  return Number.isFinite(total) ? total : null;
}

/** Sum of population across every part of `geometry`, or null if it can't be computed. */
async function computePopulation(geometry) {
  const bodies = compact(geometry);
  if (!bodies) return null;
  let sum = 0;
  for (const body of bodies) {
    const value = await fetchOnePolygon(body);
    if (value === null) return null;
    sum += value;
  }
  return Math.round(sum);
}

/** The cached population for `geometry`, or null if it has not been computed yet. */
function cachedPopulation(geometry) {
  const value = cache[hashOf(geometry)];
  return typeof value === 'number' ? value : null;
}

/**
 * Compute and cache population for up to `budget` geometries that are not cached yet.
 * Never throws per-geometry - a failed lookup is just skipped and retried next call.
 * Returns how many were newly computed.
 */
async function fillPopulations(geometries, { budget = 20 } = {}) {
  const todo = [];
  const seen = new Set();
  for (const geometry of geometries) {
    const key = hashOf(geometry);
    if (seen.has(key) || key in cache) continue;
    seen.add(key);
    todo.push({ key, geometry });
    if (todo.length >= budget) break;
  }
  let computed = 0;
  for (const { key, geometry } of todo) {
    try {
      const population = await computePopulation(geometry);
      cache[key] = population; // cache the miss too (null), so a shape that never resolves is not retried every cycle
      if (population !== null) computed += 1;
    } catch {
      /* leave uncached, retry next call */
    }
  }
  if (computed > 0) saveCache();
  return computed;
}

/** "1.2 million" / "28,000" / "870" - for titles, not raw numbers. */
function formatPopulation(n) {
  if (!Number.isFinite(n)) return null;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million`;
  if (n >= 1000) return `${Math.round(n / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return String(Math.round(n / 10) * 10);
}

module.exports = { cachedPopulation, fillPopulations, formatPopulation };
