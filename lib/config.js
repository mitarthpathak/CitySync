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

  // Every third-party key, read here ONLY - no adapter/route ever touches process.env
  // directly, and none of these are ever logged or returned in a response (only the
  // boolean "is one configured" is, via lib/sources.js's `keyConfigured`).
  keys: {
    waqiToken: process.env.WAQI_TOKEN || null,
    tomtomKey: process.env.TOMTOM_KEY || null,
    mapplsApiKey: process.env.MAPPLS_API_KEY || null,
    bhuvanKey: process.env.BHUVAN_KEY || null,
    // Not read by any live adapter yet (all three connectors below are planned stubs) -
    // centralized here anyway, so /api/sources can honestly show keyConfigured for them.
    mosdacApiKey: process.env.MOSDAC_API_KEY || null,
    iudxAuthToken: process.env.IUDX_AUTH_TOKEN || null,
    earthEngineConfigured: Boolean(process.env.EARTH_ENGINE_PROJECT && process.env.EARTH_ENGINE_SERVICE_ACCOUNT && process.env.EARTH_ENGINE_PRIVATE_KEY),
  },

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
    waqi: 10 * 60 * 1000,
    waterlogging: 20 * 60 * 1000,
    tomtom: 5 * 60 * 1000,
    historical: 24 * 60 * 60 * 1000,
    exposure: 24 * 60 * 60 * 1000, // rebuilt by scripts/fetch-exposure.js, not by this refresh
    context: 10 * 60 * 1000,
    flood: 6 * 60 * 60 * 1000,
    rainForecast: 15 * 60 * 1000,
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

  // TomTom's free tier is 2,500 requests/day. The adapter counts its own requests (see
  // adapters/tomtom.js) and stops calling out, well short of the cap, for the rest of the
  // UTC day rather than ever risking a paid overage - a request budget, not just a poll rate.
  tomtom: {
    pollMs: 5 * 60 * 1000,
    dailyRequestCap: 2000,
  },

  // Open-Meteo Flood (GloFAS): a river-grid model, so points must sit ON a river or the
  // discharge comes back near-zero. Coordinates live in config/river-points.js.
  flood: {
    forecastDays: 30,
    pastDays: 5, // recent baseline to compare the forecast rise against
    riseRatio: 1.4, // forecast peak / recent-baseline mean above this = "flood_forecast" event
  },

  // Predictive rain: reuses the existing weather calls (adapters/weather.js,
  // adapters/cityGrid.js), just with hourly precipitation_probability/precipitation added.
  rainForecast: {
    probabilityThreshold: 70, // % - above this, a city gets a "rain_forecast" event
    windowHours: 3,
  },
};
