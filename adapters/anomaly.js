'use strict';

const { fetchJson, sleep } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { CITIES, slug } = require('./cityGrid');

// Temperature anomalies from the Open-Meteo historical archive (ERA5 reanalysis, keyless).
//
// For every grid city: the most recent day the archive has (it lags real time by a few
// days) vs. the same calendar window (±3 days) in each of the previous 10 years. Both sides
// come from the SAME dataset on purpose: comparing a live forecast against reanalysis
// climatology would mostly measure model bias, not weather. An "anomaly" event is emitted
// only where the deviation is large, in absolute terms AND relative to that place's normal
// spread. Tag REAL_STATIC: real data, not live.
//
// Cost: 1 request for the recent window + 10 requests (one per past year, all cities in
// each) = 11 requests per daily refresh, spaced 1.5 s apart.

const API = 'https://archive-api.open-meteo.com/v1/archive';
const YEARS = 10;
const HALF_WINDOW_DAYS = 3;
const MIN_ABS_C = 3; // never flag less than 3 °C
const MIN_Z = 1.75; // ...nor anything within 1.75 standard deviations of normal
const DAY_MS = 24 * 60 * 60 * 1000;

const LATS = CITIES.map((c) => c.lat).join(',');
const LNGS = CITIES.map((c) => c.lng).join(',');
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

async function fetchWindow(start, end) {
  const url = `${API}?latitude=${LATS}&longitude=${LNGS}&start_date=${start}&end_date=${end}&daily=temperature_2m_max&timezone=GMT`;
  const data = await fetchJson(url, { timeoutMs: 30000 });
  const list = Array.isArray(data) ? data : [data];
  if (list.length !== CITIES.length) throw new Error(`archive returned ${list.length} locations for ${CITIES.length} cities`);
  return list.map((loc) => ({ time: loc?.daily?.time ?? [], values: loc?.daily?.temperature_2m_max ?? [] }));
}

function severityOf(z) {
  const a = Math.abs(z);
  if (a >= 3.5) return 4;
  if (a >= 2.5) return 3;
  return 2;
}

let lastStats = null;

async function fetchAnomalies() {
  const now = Date.now();

  // 1) Latest day the archive has for most cities.
  const recent = await fetchWindow(isoDay(now - 12 * DAY_MS), isoDay(now));
  const dayCounts = new Map();
  for (const { time, values } of recent) {
    time.forEach((d, i) => { if (typeof values[i] === 'number') dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1); });
  }
  const target = [...dayCounts.entries()].filter(([, n]) => n >= CITIES.length * 0.8).map(([d]) => d).sort().pop();
  if (!target) throw new Error('archive has no recent day with data for most cities');
  const targetMs = Date.parse(`${target}T00:00:00Z`);

  // 2) Same calendar window in each of the previous YEARS years.
  const samples = CITIES.map(() => []);
  let yearsOk = 0;
  for (let y = 1; y <= YEARS; y += 1) {
    const center = new Date(targetMs);
    center.setUTCFullYear(center.getUTCFullYear() - y);
    try {
      const window = await fetchWindow(isoDay(center.getTime() - HALF_WINDOW_DAYS * DAY_MS), isoDay(center.getTime() + HALF_WINDOW_DAYS * DAY_MS));
      window.forEach(({ values }, i) => values.forEach((v) => { if (typeof v === 'number') samples[i].push(v); }));
      yearsOk += 1;
    } catch (err) {
      console.warn(`[anomaly] year -${y} failed: ${err.message}`);
    }
    await sleep(1500);
  }
  if (yearsOk < YEARS / 2) throw new Error(`only ${yearsOk}/${YEARS} past years available`);

  // 3) Compare.
  const label = new Date(targetMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const firstYear = new Date(targetMs).getUTCFullYear() - YEARS;
  const lastYear = new Date(targetMs).getUTCFullYear() - 1;
  const events = [];
  let compared = 0;
  CITIES.forEach((city, i) => {
    const idx = recent[i].time.indexOf(target);
    const value = idx >= 0 ? recent[i].values[idx] : null;
    const s = samples[i];
    if (typeof value !== 'number' || s.length < 20) return;
    compared += 1;
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / (s.length - 1)) || 0.1;
    const delta = value - mean;
    const z = delta / sd;
    if (Math.abs(delta) < MIN_ABS_C || Math.abs(z) < MIN_Z) return;
    const sign = delta > 0 ? '+' : '−';
    const word = delta > 0 ? 'warmer' : 'colder';
    try {
      events.push(
        makeEvent({
          id: `anomaly-${slug(city.name)}-${target}`,
          type: 'anomaly',
          title: `${city.name}: max ${value}°C on ${label}, ${sign}${Math.abs(delta).toFixed(1)}°C ${word} than the ${firstYear}–${lastYear} normal`,
          lat: city.lat,
          lng: city.lng,
          timestamp: `${target}T12:00:00Z`,
          severity: severityOf(z),
          source: 'Open-Meteo archive (ERA5)',
          isSimulated: false,
          layer: 'anomaly',
          tag: 'REAL_STATIC',
          sourceUrl: `https://open-meteo.com/en/docs/historical-weather-api#latitude=${city.lat}&longitude=${city.lng}`,
          raw: {
            city: city.name,
            country: city.country,
            date: target,
            observed_max_c: value,
            normal_max_c: Number(mean.toFixed(1)),
            deviation_c: Number(delta.toFixed(1)),
            z_score: Number(z.toFixed(2)),
            baseline: `${firstYear}–${lastYear}, ±${HALF_WINDOW_DAYS} days around ${label} (${s.length} daily values)`,
            note: 'Reanalysis data with a few days\' lag; not live.',
          },
        }),
      );
    } catch {
      /* skip */
    }
  });

  lastStats = { targetDay: target, yearsOk, compared, anomalies: events.length };
  console.log(`[anomaly] ${target}: ${compared} cities compared over ${yearsOk} years -> ${events.length} anomalies`);
  return events;
}

module.exports = { fetchAnomalies, getAnomalyStats: () => lastStats };
