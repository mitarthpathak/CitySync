'use strict';

const config = require('./config');
const { cached } = require('./cache');
const { loadMockEvents } = require('./mock');
const { AMER, LOCAL_RADIUS_KM, isWithinKm } = require('./geo');
const { fetchUsgs } = require('../adapters/usgs');
const { fetchWeather } = require('../adapters/weather');
const { fetchAirQuality } = require('../adapters/airQuality');
const { generateAmerEvents } = require('../adapters/amerSim');

// `types` decides which slice of events.json backfills a feed.
// `cache:false` for the simulator so it varies on every request.
const FEEDS = [
  { key: 'usgs', types: ['earthquake'], run: fetchUsgs, cache: true, okStatus: 'live' },
  { key: 'weather', types: ['weather'], run: fetchWeather, cache: true, okStatus: 'live' },
  { key: 'aq', types: ['air_quality'], run: fetchAirQuality, cache: true, okStatus: 'live' },
  { key: 'amer', types: ['traffic', 'crowd', 'civic', 'event'], run: generateAmerEvents, cache: false, okStatus: 'sim' },
];

let lastSummary = '';

// The warning lives here (per real upstream attempt), not in collect(), so a cached
// failure is not re-logged on every request.
async function attempt(feed) {
  try {
    const events = await feed.run();
    if (!Array.isArray(events)) throw new Error('adapter returned a non-array');
    return events;
  } catch (err) {
    console.warn(`[${feed.key}] feed failed (${err.message || err}) - falling back to mock`);
    throw err;
  }
}

function runFeed(feed) {
  const run = () => attempt(feed);
  return feed.cache ? cached(feed.key, config.cacheTtlMs, config.failureTtlMs, run) : run();
}

/**
 * Call every feed, fall back to the mock file per feed, and fuse into one list.
 * Returns { events, feeds } where feeds[key] is "live" | "sim" | "mock" | "down".
 * Never rejects.
 */
async function collect() {
  let mockPromise;
  const getMock = () => (mockPromise ??= loadMockEvents());
  const mockSlice = async (feed) => (await getMock()).filter((e) => feed.types.includes(e.type));

  const feeds = {};
  const parts = [];

  async function useMock(feed) {
    const slice = await mockSlice(feed);
    feeds[feed.key] = slice.length ? 'mock' : 'down';
    parts.push(slice);
  }

  if (config.useMock) {
    for (const feed of FEEDS) await useMock(feed);
  } else {
    const settled = await Promise.allSettled(FEEDS.map(runFeed));
    for (const [i, result] of settled.entries()) {
      const feed = FEEDS[i];
      if (result.status === 'fulfilled') {
        feeds[feed.key] = feed.okStatus;
        parts.push(result.value);
      } else {
        await useMock(feed); // failure already logged by attempt()
      }
    }
  }

  // Concatenate, drop duplicate ids, newest first.
  const byId = new Map();
  for (const event of parts.flat()) if (!byId.has(event.id)) byId.set(event.id, event);
  const events = [...byId.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const summary = FEEDS.map((f) => `${f.key}=${feeds[f.key]}`).join(' ');
  if (summary !== lastSummary) {
    console.log(`[feeds] ${summary}`);
    lastSummary = summary;
  }

  return { events, feeds };
}

/** @param {'global'|'local'} scope */
function applyScope(events, scope) {
  return scope === 'local' ? events.filter((e) => isWithinKm(e, AMER, LOCAL_RADIUS_KM)) : events;
}

async function getEvents(scope = 'global') {
  const { events } = await collect();
  return applyScope(events, scope);
}

async function getSnapshot() {
  return collect();
}

module.exports = { getEvents, getSnapshot, applyScope };
