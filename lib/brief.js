'use strict';

// "Now + next hours" brief: one plain line on what is happening around a point right now,
// what the next hours look like, and what to do about it ("power outage in X now; heavy
// rain likely 5-7 PM -> finish power-dependent work before 5 PM").
// Pure composition over data the server already holds: the local events (cache) and the
// point's cached hourly forecast. Thresholds are project heuristics, not official warnings.

const { getEvents } = require('./normalize');
const { getHourlyForecast } = require('../adapters/hourlyForecast');

const LOOKAHEAD_HOURS = 6;
const RAIN_PROB_PCT = 50; // an hour counts as "rainy" at >= this probability ...
const RAIN_MM = 0.5; // ... or >= this much forecast precipitation
const THUNDER_CODES = [95, 96, 99];
const HEAT_C = 40;
const AQI_UNHEALTHY = 150;

/** "5 PM" in the point's local time. */
function clock(iso, offsetSec) {
  const d = new Date(Date.parse(iso) + offsetSec * 1000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const h12 = h % 12 || 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "5–7 PM", or "11 AM–1 PM" across noon/midnight. */
function span(fromIso, toIso, offsetSec) {
  const a = clock(fromIso, offsetSec);
  const b = clock(toIso, offsetSec);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

function intensityOf(mmPerHour, thunder) {
  if (thunder) return 'thunderstorm';
  if (mmPerHour >= 7.6) return 'heavy rain';
  if (mmPerHour >= 2.5) return 'moderate rain';
  return 'light rain';
}

const isRainy = (h) => (h.precipProbPct ?? 0) >= RAIN_PROB_PCT || (h.precipMm ?? 0) >= RAIN_MM || THUNDER_CODES.includes(h.weatherCode);

/** First contiguous rainy window within the lookahead, or null. */
function rainWindow(hours, offsetSec) {
  const ahead = hours.slice(0, LOOKAHEAD_HOURS);
  const start = ahead.findIndex(isRainy);
  if (start < 0) return null;
  let end = start;
  while (end + 1 < ahead.length && isRainy(ahead[end + 1])) end += 1;
  const slice = ahead.slice(start, end + 1);
  const maxProb = Math.max(...slice.map((h) => h.precipProbPct ?? 0));
  const maxMm = Math.max(...slice.map((h) => h.precipMm ?? 0));
  const thunder = slice.some((h) => THUNDER_CODES.includes(h.weatherCode));
  const endIso = new Date(Date.parse(ahead[end].at) + 3600 * 1000).toISOString();
  return {
    startsAt: ahead[start].at,
    endsAt: endIso,
    startsNow: Date.parse(ahead[start].at) <= Date.now(),
    maxProbPct: maxProb,
    maxMmPerHour: Math.round(maxMm * 10) / 10,
    kind: intensityOf(maxMm, thunder),
    label: span(ahead[start].at, endIso, offsetSec),
  };
}

const simNote = (e) => (e.tag === 'SIMULATED' ? ' (simulated)' : '');
const shortPlace = (e) => e.title.replace(/^Possible waterlogging risk:\s*/i, '');

async function buildBrief(center) {
  const events = await getEvents('local', null, center);
  const fc = getHourlyForecast(center.lat, center.lng);
  const offset = fc.data?.utcOffsetSeconds ?? 0;
  const hours = fc.data?.hours ?? [];
  const nowMs = Date.now();

  // ---- Now ----
  const now = [];
  const cur = fc.data?.current;
  if (cur) now.push({ kind: 'weather', text: `${cur.label ?? 'Weather'}, ${Math.round(cur.tempC)}°C`, severity: THUNDER_CODES.includes(cur.weatherCode) ? 4 : 2, tag: 'REAL_LIVE' });

  const alerts = events.filter((e) => e.type === 'alert' && e.severity >= 3).sort((a, b) => b.severity - a.severity);
  if (alerts[0]) now.push({ kind: 'alert', text: alerts[0].title, severity: alerts[0].severity, tag: alerts[0].tag });

  const outages = events.filter((e) => e.type === 'civic' && e.raw?.category === 'power');
  for (const e of outages.slice(0, 1)) now.push({ kind: 'power', text: `${e.title}${simNote(e)}`, severity: Math.max(3, e.severity), tag: e.tag, zone: e.raw?.zone ?? null });
  const otherCivic = events.filter((e) => e.type === 'civic' && e.raw?.category !== 'power');
  for (const e of otherCivic.slice(0, 1)) now.push({ kind: 'civic', text: `${e.title}${simNote(e)}`, severity: e.severity, tag: e.tag });

  const aqi = events.find((e) => e.type === 'air_quality' && Number.isFinite(e.raw?.us_aqi));
  if (aqi && aqi.raw.us_aqi > AQI_UNHEALTHY) now.push({ kind: 'air', text: `AQI ${Math.round(aqi.raw.us_aqi)} (unhealthy)`, severity: 4, tag: aqi.tag });

  const jam = events.filter((e) => e.type === 'traffic' && e.severity >= 4).sort((a, b) => b.severity - a.severity)[0];
  if (jam) now.push({ kind: 'traffic', text: `${jam.title}${simNote(jam)}`, severity: jam.severity, tag: jam.tag });

  // ---- Next ----
  const next = [];
  const rain = hours.length ? rainWindow(hours, offset) : null;
  const inOneHour = hours.find((h) => Date.parse(h.at) >= nowMs + 30 * 60 * 1000);
  if (inOneHour) {
    next.push({
      kind: 'hour',
      at: inOneHour.at,
      text: `${clock(inOneHour.at, offset)}: ${inOneHour.label ?? 'Forecast'}, ${Math.round(inOneHour.tempC)}°C, ${inOneHour.precipProbPct ?? 0}% rain chance`,
      severity: isRainy(inOneHour) ? 3 : 1,
      tag: 'ESTIMATED',
    });
  }
  if (rain) {
    next.push({
      kind: 'rain',
      text: rain.startsNow
        ? `${cap(rain.kind)} likely until ${clock(rain.endsAt, offset)} (up to ${rain.maxProbPct}%)`
        : `${cap(rain.kind)} likely ${rain.label} (up to ${rain.maxProbPct}%)`,
      severity: rain.kind === 'thunderstorm' || rain.kind === 'heavy rain' ? 4 : 3,
      tag: 'ESTIMATED',
      window: rain,
    });
  } else if (hours.length) {
    next.push({ kind: 'rain', text: `No rain expected in the next ${LOOKAHEAD_HOURS} hours`, severity: 1, tag: 'ESTIMATED' });
  }
  const peak = hours.slice(0, LOOKAHEAD_HOURS).reduce((best, h) => (Number.isFinite(h.tempC) && (!best || h.tempC > best.tempC) ? h : best), null);
  if (peak && peak.tempC >= HEAT_C) next.push({ kind: 'heat', text: `Heat peaks at ${Math.round(peak.tempC)}°C around ${clock(peak.at, offset)}`, severity: 4, tag: 'ESTIMATED' });

  // ---- Do ----
  const actions = [];
  const hotspots = events.filter((e) => e.layer === 'waterlogging_risk').map(shortPlace);
  if (rain && !rain.startsNow) {
    const before = clock(rain.startsAt, offset);
    const outage = outages[0];
    if (outage) actions.push(`${outage.raw?.zone ?? 'Outage area'}: finish power-dependent work and charge devices before ${before}${simNote(outage)}`);
    else actions.push(`Finish outdoor work before ${before}`);
  }
  if (rain && hotspots.length) actions.push(`Avoid ${hotspots.slice(0, 2).join(' and ')} during ${rain.startsNow ? `rain (until ${clock(rain.endsAt, offset)})` : rain.label}: waterlogging-prone`);
  if (peak && peak.tempC >= HEAT_C) actions.push(`Avoid outdoor exertion around ${clock(peak.at, offset)}`);
  if (aqi && aqi.raw.us_aqi > AQI_UNHEALTHY) actions.push('Limit time outdoors; sensitive groups wear a mask');
  if (jam) actions.push(`Expect delays: ${jam.raw?.road ?? jam.title}`);

  // ---- One line ----
  // Current weather always leads (it sets the scene), then the two most severe incidents.
  const incidents = now.filter((i) => i.kind !== 'weather').sort((a, b) => b.severity - a.severity).slice(0, 2);
  const topNow = [...now.filter((i) => i.kind === 'weather'), ...incidents].map((i) => i.text);
  const nextLead = next.find((i) => i.kind === 'rain' && i.window) ?? next.find((i) => i.kind === 'heat') ?? next.find((i) => i.kind === 'hour');
  const parts = [];
  if (topNow.length) parts.push(`Now: ${topNow.join('; ')}.`);
  if (nextLead) parts.push(`Next: ${nextLead.text}.`);
  if (actions[0]) parts.push(`${actions[0]}.`);
  const line = parts.join(' ') || (fc.pending ? 'Building the brief…' : 'Nothing notable nearby right now.');

  return {
    generatedAt: new Date().toISOString(),
    center,
    line,
    now,
    next,
    actions,
    forecast: { fetchedAt: fc.fetchedAt, pending: fc.pending, error: fc.error, source: 'Open-Meteo (forecast model)' },
    disclaimer: 'Forecasts are model estimates, not official warnings. Items marked simulated are demo data.',
  };
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { buildBrief, rainWindow };
