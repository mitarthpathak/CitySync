'use strict';

// Open-Meteo Flood (GloFAS): a global river-discharge model. Emits a "flood_forecast"
// event only where the forecast rises sharply against the point's own recent baseline -
// this is MODELLED river discharge, never a measured gauge reading, so it's always
// tagged ESTIMATED (see lib/event.js's DEFAULT_TAG) and phrased as a risk, not a forecast
// fact. riseRatio and both windows are project heuristics (lib/config.js's `flood`), not
// an official flood-warning threshold.

const config = require('../lib/config');
const { fetchJson } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const RIVER_POINTS = require('../config/river-points');

const ALL_POINTS = [...RIVER_POINTS.jaipur, ...RIVER_POINTS.world];

let lastStats = null;

async function fetchPoint(point) {
  const { pastDays, forecastDays, riseRatio } = config.flood;
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${point.lat}&longitude=${point.lng}&daily=river_discharge&past_days=${pastDays}&forecast_days=${forecastDays}`;
  const data = await fetchJson(url);
  const discharge = data?.daily?.river_discharge;
  const dates = data?.daily?.time;
  if (!Array.isArray(discharge) || discharge.length <= pastDays) return { point, outcome: 'no-data' };

  const past = discharge.slice(0, pastDays).filter(Number.isFinite);
  const future = discharge.slice(pastDays).filter(Number.isFinite);
  if (!past.length || !future.length) return { point, outcome: 'no-data' };

  const baseline = past.reduce((a, b) => a + b, 0) / past.length;
  const peak = Math.max(...future);
  // A point that isn't really on a modelled river channel: near-zero both before and
  // after. Flagged so the caller can report exactly which configured points don't work.
  if (baseline < 0.5 && peak < 0.5) return { point, outcome: 'near-zero', baseline, peak };

  const ratio = baseline > 0 ? peak / baseline : (peak > 0 ? Infinity : 1);
  if (ratio < riseRatio) return { point, outcome: 'calm', baseline, peak, ratio };

  const peakIndex = future.indexOf(peak);
  const peakDate = dates?.[pastDays + peakIndex] ?? null;
  const event = makeEvent({
    id: `flood-${point.name.replace(/\W/g, '-')}-${peakDate ?? Date.now()}`,
    type: 'flood',
    tag: 'ESTIMATED',
    sourceUrl: url,
    title: `Rising river discharge forecast: ${point.river} near ${point.name}`,
    lat: point.lat,
    lng: point.lng,
    timestamp: new Date().toISOString(),
    severity: ratio >= 3 ? 5 : ratio >= 2 ? 4 : 3,
    source: 'Open-Meteo Flood (GloFAS)',
    raw: {
      river: point.river,
      baseline_m3s: Number(baseline.toFixed(1)),
      peak_m3s: Number(peak.toFixed(1)),
      rise_ratio: Number(ratio.toFixed(2)),
      peak_date: peakDate,
      note: 'MODELLED river discharge (GloFAS forecast), not a measured gauge reading. A possible risk, not a confirmed flood.',
    },
  });
  return { point, outcome: 'event', baseline, peak, ratio, event };
}

async function fetchFlood() {
  const settled = await Promise.allSettled(ALL_POINTS.map(fetchPoint));
  const results = settled.map((r, i) => (r.status === 'fulfilled' ? r.value : { point: ALL_POINTS[i], outcome: 'error', error: r.reason?.message }));
  lastStats = {
    checked: results.length,
    events: results.filter((r) => r.outcome === 'event').length,
    calm: results.filter((r) => r.outcome === 'calm').length,
    nearZero: results.filter((r) => r.outcome === 'near-zero').map((r) => r.point.name),
    errors: results.filter((r) => r.outcome === 'error' || r.outcome === 'no-data').map((r) => r.point.name),
  };
  if (lastStats.nearZero.length) {
    console.warn(`[flood] near-zero discharge (likely not on a modelled river channel), dropped: ${lastStats.nearZero.join(', ')}`);
  }
  const events = results.filter((r) => r.event).map((r) => r.event);
  if (!events.length && !results.some((r) => r.outcome === 'calm')) {
    // Every single point failed outright (e.g. no network) - that's a real adapter
    // failure, distinct from "checked fine, nothing is rising right now".
    throw new Error('flood: no configured point returned usable data');
  }
  return events;
}

const getFloodStats = () => lastStats;

module.exports = { fetchFlood, getFloodStats };
