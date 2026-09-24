'use strict';

const { fetchJson, mapLimit } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { CITIES, slug } = require('./cityGrid');

// NASA POWER daily point API (keyless): T2M (mean), T2M_MAX and PRECTOTCORR (precipitation)
// for the same world city grid. POWER is a daily reanalysis product with a few days' lag,
// so these are REAL_STATIC: real measured-model data, never presented as live.
// One request per city (POWER has no multi-point endpoint), 3 at a time, refreshed daily.

const FILL = -999;
const CONCURRENCY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const ymd = (date) => date.toISOString().slice(0, 10).replace(/-/g, '');

function urlFor(city, now) {
  const start = ymd(new Date(now - 14 * DAY_MS));
  const end = ymd(new Date(now));
  return (
    'https://power.larc.nasa.gov/api/temporal/daily/point' +
    `?parameters=T2M,T2M_MAX,PRECTOTCORR&community=RE&latitude=${city.lat}&longitude=${city.lng}` +
    `&start=${start}&end=${end}&format=JSON`
  );
}

function severityOf(maxC, rainMm) {
  let s = 1;
  if (maxC >= 40) s = 4;
  else if (maxC >= 35) s = 3;
  if (rainMm >= 100) s = Math.max(s, 4);
  else if (rainMm >= 50) s = Math.max(s, 3);
  else if (rainMm >= 20) s = Math.max(s, 2);
  return s;
}

async function fetchCity(city, now) {
  const url = urlFor(city, now);
  const data = await fetchJson(url, { timeoutMs: 30000 });
  const p = data?.properties?.parameter;
  if (!p?.T2M) throw new Error('no T2M series');
  // Latest day with real (non-fill) values for all three parameters.
  const day = Object.keys(p.T2M)
    .sort()
    .reverse()
    .find((d) => [p.T2M[d], p.T2M_MAX?.[d], p.PRECTOTCORR?.[d]].every((v) => typeof v === 'number' && v !== FILL));
  if (!day) return null;

  const meanC = p.T2M[day];
  const maxC = p.T2M_MAX[day];
  const rainMm = p.PRECTOTCORR[day];
  const iso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return makeEvent({
    id: `climate-${slug(city.name)}-${day}`,
    type: 'climate',
    title: `${city.name}: mean ${meanC}°C, max ${maxC}°C, rain ${rainMm} mm (${label}, daily)`,
    lat: city.lat,
    lng: city.lng,
    timestamp: `${iso}T12:00:00Z`,
    severity: severityOf(maxC, rainMm),
    source: 'NASA POWER',
    isSimulated: false,
    layer: 'climate',
    tag: 'REAL_STATIC',
    sourceUrl: url,
    raw: {
      city: city.name,
      country: city.country,
      date: iso,
      note: 'Daily reanalysis value, published with a few days\' lag. Not live.',
      t2m_mean_c: meanC,
      t2m_max_c: maxC,
      precipitation_mm: rainMm,
    },
  });
}

let lastStats = null;

async function fetchNasaPower() {
  const now = Date.now();
  const results = await mapLimit(CITIES, CONCURRENCY, (city) => fetchCity(city, now));
  const events = results.filter(Boolean);
  lastStats = { cities: CITIES.length, ok: events.length, failed: CITIES.length - events.length };
  console.log(`[nasaPower] ${events.length}/${CITIES.length} cities`);
  if (!events.length) throw new Error('no city returned usable NASA POWER data');
  return events;
}

module.exports = { fetchNasaPower, getNasaPowerStats: () => lastStats };
