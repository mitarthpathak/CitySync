'use strict';

// Open-Meteo hourly forecast for ANY point (the LOCAL view's selected location), used by the
// "Now + next hours" brief. Unlike the scheduled sources, the point is chosen by the user, so
// this is fetched on demand - but never on the request path: a request only reads the cache
// and, on a miss / expiry, kicks off a background fetch (the frontend re-polls shortly).
// Points are snapped to a ~0.05° grid (~5 km) so nearby selections share one cache entry.

const config = require('../lib/config');
const { fetchJson } = require('../lib/http');
const { describeWeatherCode } = require('./weather');

const TTL_MS = 15 * 60 * 1000;
const FAILURE_RETRY_MS = 2 * 60 * 1000;
const HOURS = 12;
const MAX_ENTRIES = 200;

const store = new Map(); // key -> { data, fetchedAt, error, inflight, nextTryAt }

const snap = (n) => Math.round(n * 20) / 20;
const keyOf = (lat, lng) => `${snap(lat).toFixed(2)},${snap(lng).toFixed(2)}`;

async function fetchPoint(lat, lng) {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${snap(lat)}&longitude=${snap(lng)}`
    + '&current=temperature_2m,weather_code,precipitation'
    + '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code'
    + `&forecast_hours=${HOURS + 1}&timezone=auto&timeformat=unixtime`;
  const data = await fetchJson(url);
  const h = data.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error('unexpected payload: missing hourly');
  const hours = h.time.map((t, i) => {
    const code = h.weather_code?.[i];
    return {
      at: new Date(t * 1000).toISOString(),
      tempC: h.temperature_2m?.[i] ?? null,
      precipProbPct: h.precipitation_probability?.[i] ?? null,
      precipMm: h.precipitation?.[i] ?? null,
      weatherCode: code ?? null,
      label: Number.isFinite(code) ? describeWeatherCode(code).label : null,
    };
  });
  const c = data.current || {};
  return {
    utcOffsetSeconds: data.utc_offset_seconds ?? 0,
    current: Number.isFinite(c.temperature_2m)
      ? { tempC: c.temperature_2m, weatherCode: c.weather_code ?? null, precipMm: c.precipitation ?? null, label: Number.isFinite(c.weather_code) ? describeWeatherCode(c.weather_code).label : null }
      : null,
    hours,
  };
}

function startFetch(key, lat, lng) {
  const entry = store.get(key) ?? {};
  if (entry.inflight) return;
  entry.inflight = fetchPoint(lat, lng)
    .then((data) => Object.assign(entry, { data, fetchedAt: Date.now(), error: null, nextTryAt: Date.now() + TTL_MS }))
    .catch((err) => {
      Object.assign(entry, { error: err.message || String(err), nextTryAt: Date.now() + FAILURE_RETRY_MS });
      console.warn(`[hourlyForecast] ${key} failed (${entry.error})`);
    })
    .finally(() => { entry.inflight = null; });
  store.set(key, entry);
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value); // oldest first
}

/**
 * Cache-only read. Returns { data, fetchedAt, error, pending }; `data` stays the last good
 * forecast while a refresh runs. Never awaits the network.
 */
function getHourlyForecast(lat, lng) {
  if (config.useMock) return { data: null, fetchedAt: null, error: 'mock mode: no forecast', pending: false };
  const key = keyOf(lat, lng);
  const entry = store.get(key);
  if (!entry || (!entry.inflight && Date.now() >= (entry.nextTryAt ?? 0))) startFetch(key, lat, lng);
  const e = store.get(key);
  // Hours already in the past are dropped so an older cached forecast still reads "from now".
  const cutoff = Date.now() - 60 * 60 * 1000;
  const data = e.data ? { ...e.data, hours: e.data.hours.filter((h) => Date.parse(h.at) > cutoff) } : null;
  return { data, fetchedAt: e.fetchedAt ? new Date(e.fetchedAt).toISOString() : null, error: e.error ?? null, pending: Boolean(e.inflight) && !e.data };
}

/** Warm one point (e.g. the default location at startup) so the first brief isn't empty. */
function prefetchHourlyForecast(lat, lng) {
  startFetch(keyOf(lat, lng), lat, lng);
}

module.exports = { getHourlyForecast, prefetchHourlyForecast };
