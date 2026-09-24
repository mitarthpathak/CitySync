'use strict';

const path = require('path');

// .env is optional; every value has a default so `npm install && npm start` just works.
// Anchored to the project root so it loads no matter which directory the server is started from.
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

module.exports = {
  port: Number(process.env.PORT) || 3000,

  // When true: serve ONLY events.json, make zero network calls.
  // Either USE_MOCK=true or the `--mock` flag (works the same on Windows, macOS, Linux).
  useMock: isTruthy(process.env.USE_MOCK) || process.argv.includes('--mock'),

  // Per-request budget for one upstream call.
  fetchTimeoutMs: 6000,

  // A good upstream answer is reused this long (protects upstream rate limits when the
  // frontend polls). A failed answer is remembered briefly so an outage is not re-hit
  // (and re-logged) on every request.
  cacheTtlMs: 60 * 1000,
  failureTtlMs: 15 * 1000,

  // Background refresh interval per source. Endpoints only ever read the result.
  ttl: {
    usgs: 60 * 1000,
    amerWeather: 10 * 60 * 1000,
    amerAq: 10 * 60 * 1000,
    cityWeather: 10 * 60 * 1000,
    cityAq: 10 * 60 * 1000,
    gdelt: 15 * 60 * 1000,
    sachet: 15 * 60 * 1000,
    nasaPower: 24 * 60 * 60 * 1000,
    anomaly: 24 * 60 * 60 * 1000,
  },
  // After a failed refresh, retry sooner than the full TTL (but not immediately).
  retryAfterFailureMs: 2 * 60 * 1000,
  // A source whose refresh fails keeps serving its last good data for this long before
  // it falls back to events.json. Stale data is still flagged in /health.
  staleGraceMs: 60 * 60 * 1000,

  // GDELT DOC 2.0: documented limit ~1 request / 5 s, but in practice it answers 429 at 6 s
  // spacing too, so requests are spaced 10 s apart (10 queries = ~100 s per 15-min cycle).
  gdelt: {
    minGapMs: Number(process.env.GDELT_MIN_GAP_MS) || 10000,
    timespan: '24h',
    maxRecords: 75,
    // Each entry = one GDELT request per refresh cycle (~10 s each). `sourcelang:english`
    // is appended automatically, because articles are placed by place names in the headline.
    // Override with GDELT_QUERIES as "label=query|label=query", e.g.
    //   GDELT_QUERIES="flood=(flood OR flooding)|wildfire=wildfire"
    queries: process.env.GDELT_QUERIES
      ? process.env.GDELT_QUERIES.split('|').map((entry) => {
          const [label, ...rest] = entry.split('=');
          return rest.length ? { label: label.trim(), query: rest.join('=').trim() } : { label: entry.trim(), query: entry.trim() };
        }).filter((q) => q.label && q.query)
      : [
          { label: 'flood', query: '(flood OR flooding)' },
          { label: 'earthquake damage', query: '"earthquake damage"' },
          { label: 'wildfire', query: '(wildfire OR "forest fire")' },
          { label: 'heatwave', query: '(heatwave OR "heat wave")' },
          { label: 'air pollution', query: '("air pollution" OR smog)' },
          { label: 'storm', query: '(storm OR cyclone OR typhoon OR hurricane)' },
          { label: 'power outage', query: '("power outage" OR blackout)' },
          { label: 'protest', query: 'protest' },
          // `country`: keep only articles whose headline places them in that country.
          { label: 'Jaipur / Rajasthan', query: '(Jaipur OR Rajasthan)', country: 'India' },
          { label: 'Amer Fort', query: '("Amer Fort" OR "Amber Fort")', country: 'India' },
        ],
  },

  // Tier 2 sources can be switched off without touching code.
  enableNasaPower: !isTruthy(process.env.DISABLE_NASA_POWER),
  enableAnomaly: !isTruthy(process.env.DISABLE_ANOMALY),
};
