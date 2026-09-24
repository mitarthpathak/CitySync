'use strict';

const config = require('./config');
const { loadMockEvents } = require('./mock');
const { withDefaults, LAYERS } = require('./event');
const { AMER, LOCAL_RADIUS_KM, isWithinKm } = require('./geo');
const { SOURCES } = require('./sources');

// ---------------------------------------------------------------------------------------
// Background scheduler + per-source cache.
//
// Each timed source refreshes on its own interval (config.ttl) and writes into `state`.
// HTTP handlers only READ `state`: no request ever triggers an upstream call (the Amer
// simulator is generated locally per request; it has no upstream). Sources are fully
// independent: a failing / slow / hanging source never blocks or sinks the others.
//
// Status per source (reported by /health):
//   live      last refresh succeeded (or failed < staleGraceMs after a success: `stale: true`)
//   mock      upstream down; serving its slice of events.json (isSimulated, tag SIMULATED)
//   down      upstream down and no mock data for it
//   disabled  switched off / planned stub; never run
// ---------------------------------------------------------------------------------------

const state = new Map(); // key -> { status, events, lastSuccess, lastAttempt, lastError, stale, refreshing, nextRefreshAt }
const timers = new Map();
let started = false;
let mockPromise;
const getMock = () => (mockPromise ??= loadMockEvents());

const isEnabled = (source) => source.enabled !== false;
const timedSources = () => SOURCES.filter((s) => isEnabled(s) && !s.onRequest);

async function mockSlice(source) {
  return (await getMock()).filter((e) => source.types.includes(e.type));
}

function initialState(source) {
  return {
    status: isEnabled(source) ? 'down' : 'disabled',
    events: [],
    lastSuccess: null,
    lastAttempt: null,
    lastError: isEnabled(source) ? 'not fetched yet' : source.reason ?? 'disabled',
    stale: false,
    refreshing: false,
    nextRefreshAt: null,
  };
}
for (const source of SOURCES) state.set(source.key, initialState(source));

async function useMockFor(source, s) {
  const slice = await mockSlice(source);
  s.events = slice;
  s.status = slice.length ? 'mock' : 'down';
  s.stale = false;
}

/** Run one source's adapter and update its state. Never rejects. */
async function refresh(source) {
  const s = state.get(source.key);
  if (s.refreshing) return;
  s.refreshing = true;
  s.lastAttempt = new Date().toISOString();
  try {
    const events = await source.run();
    if (!Array.isArray(events)) throw new Error('adapter returned a non-array');
    s.events = events.map(withDefaults);
    s.status = 'live';
    s.stale = false;
    s.lastSuccess = new Date().toISOString();
    s.lastError = null;
  } catch (err) {
    s.lastError = err.message || String(err);
    const age = s.lastSuccess ? Date.now() - Date.parse(s.lastSuccess) : Infinity;
    // Daily sources get a grace period proportional to their interval, not a flat hour.
    const grace = Math.max(config.staleGraceMs, 2 * (source.ttlMs ?? 0));
    if (s.status === 'live' && age < grace) {
      s.stale = true; // keep serving the last good data for a while, flagged
      console.warn(`[${source.key}] refresh failed (${s.lastError}) - keeping last good data`);
    } else {
      await useMockFor(source, s);
      console.warn(`[${source.key}] refresh failed (${s.lastError}) - ${s.status === 'mock' ? 'serving mock' : 'no data'}`);
    }
  } finally {
    s.refreshing = false;
  }
}

function schedule(source) {
  const s = state.get(source.key);
  const delay = s.status === 'live' && !s.stale ? source.ttlMs : Math.min(source.ttlMs, source.retryMs ?? config.retryAfterFailureMs);
  s.nextRefreshAt = new Date(Date.now() + delay).toISOString();
  const timer = setTimeout(async () => {
    await refresh(source);
    if (started) schedule(source);
  }, delay);
  timer.unref?.(); // never keep the process alive just for a refresh
  timers.set(source.key, timer);
}

let lastSummary = '';
function logSummary() {
  const summary = SOURCES.filter(isEnabled).map((src) => `${src.key}=${state.get(src.key).status}`).join(' ');
  if (summary !== lastSummary) {
    console.log(`[feeds] ${summary}`);
    lastSummary = summary;
  }
}

/**
 * Start background refreshing. Every source first shows its events.json slice (so the globe
 * is never blank during warm-up), then fetches live in parallel. In mock mode nothing is
 * fetched. Returns a promise that settles when the first round is done (for logging).
 */
async function startScheduler() {
  if (started) return;
  started = true;
  const sources = timedSources();
  await Promise.all(sources.map((src) => useMockFor(src, state.get(src.key))));
  if (config.useMock) {
    logSummary();
    return;
  }
  // allSettled: refresh() already never rejects, this is belt and braces.
  await Promise.allSettled(
    sources.map(async (src) => {
      await refresh(src);
      if (started) schedule(src);
      logSummary();
    }),
  );
}

function stopScheduler() {
  started = false;
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

/** The per-request sources (simulator). Falls back to its mock slice if it throws. */
async function runOnRequestSources() {
  const parts = await Promise.allSettled(
    SOURCES.filter((s) => isEnabled(s) && s.onRequest).map(async (src) => {
      const s = state.get(src.key);
      if (config.useMock) {
        await useMockFor(src, s);
        return s.events;
      }
      try {
        const events = (await src.run()).map(withDefaults);
        Object.assign(s, { status: 'live', events: [], lastSuccess: new Date().toISOString(), lastAttempt: new Date().toISOString(), lastError: null });
        return events;
      } catch (err) {
        s.lastError = err.message || String(err);
        await useMockFor(src, s);
        return s.events;
      }
    }),
  );
  return parts.flatMap((p) => (p.status === 'fulfilled' ? p.value : []));
}

/**
 * Fuse every source's cached events into one list (deduped by id, newest first).
 * Returns { events, feeds } where feeds[key] is the source status. Never rejects.
 */
async function collect() {
  // Used without the server (e.g. required from a script): show mock data rather than nothing.
  if (!started) await Promise.all(timedSources().map(async (src) => {
    const s = state.get(src.key);
    if (s.status === 'down' && !s.lastAttempt) await useMockFor(src, s);
  }));

  const parts = [await runOnRequestSources()];
  for (const src of timedSources()) parts.push(state.get(src.key).events);

  const byId = new Map();
  for (const event of parts.flat()) if (!byId.has(event.id)) byId.set(event.id, event);
  const events = [...byId.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const feeds = {};
  for (const src of SOURCES) {
    const status = state.get(src.key).status;
    // Legacy value kept for the simulator: the original API reported it as "sim".
    feeds[src.key] = src.simulated && status === 'live' ? 'sim' : status;
  }
  logSummary();
  return { events, feeds };
}

/**
 * @param {'global'|'local'} scope
 * @param {{lat:number,lng:number}|null} center  local scope's center; defaults to Amer
 */
function applyScope(events, scope, center = null) {
  return scope === 'local' ? events.filter((e) => isWithinKm(e, center ?? AMER, LOCAL_RADIUS_KM)) : events;
}

/** @param {string[]|null} layers  keep only these layers; null = all */
function applyLayers(events, layers) {
  if (!layers) return events;
  const wanted = new Set(layers);
  return events.filter((e) => wanted.has(e.layer));
}

async function getEvents(scope = 'global', layers = null, center = null) {
  const { events } = await collect();
  return applyLayers(applyScope(events, scope, center), layers);
}

async function getSnapshot() {
  return collect();
}

/** Detailed per-source report for /health. */
async function getSourceReport() {
  const { events, feeds } = await collect();
  const counts = {};
  for (const e of events) counts[e.source] = (counts[e.source] ?? 0) + 1;

  const sources = {};
  for (const src of SOURCES) {
    const s = state.get(src.key);
    sources[src.key] = {
      label: src.label,
      layer: src.layer,
      status: s.status,
      simulated: Boolean(src.simulated),
      stale: s.stale,
      count: src.onRequest ? events.filter((e) => e.layer === src.layer).length : s.events.length,
      lastSuccess: s.lastSuccess,
      lastAttempt: s.lastAttempt,
      lastError: s.lastError,
      refreshMs: src.ttlMs ?? null,
      nextRefreshAt: s.nextRefreshAt,
      ...(src.planned ? { planned: true } : {}),
      ...(src.stats?.() ? { detail: src.stats() } : {}),
    };
  }

  const layers = Object.fromEntries(LAYERS.map((l) => [l, 0]));
  for (const e of events) layers[e.layer] = (layers[e.layer] ?? 0) + 1;

  const liveSources = SOURCES.filter((src) => !src.simulated && state.get(src.key).status === 'live').length;
  return { events, feeds, sources, layers, liveSources };
}

module.exports = { getEvents, getSnapshot, getSourceReport, applyScope, applyLayers, startScheduler, stopScheduler, refresh };
