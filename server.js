'use strict';

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const config = require('./lib/config');
const { getEvents, getSourceReport, getSourcesApiReport, startScheduler } = require('./lib/normalize');
const { LAYERS } = require('./lib/event');
const { loadMockEvents, MOCK_PATH } = require('./lib/mock');
const { AMER, LOCAL_RADIUS_KM } = require('./lib/geo');
const { wards, getWard } = require('./lib/wards');
const { buildBrief } = require('./lib/brief');
const { prefetchHourlyForecast } = require('./adapters/hourlyForecast');

const SCOPES = ['global', 'local'];

const app = express();
app.use(cors()); // all origins: the frontend is a separate Vite dev server

// GET /events?scope=global|local  (default global)
//            &layers=news,alerts,weather  (optional; default all layers)
//            &lat=..&lng=..  (optional, local scope only; defaults to Amer)
// Always answered from the in-memory cache; never triggers an upstream call.
app.get('/events', async (req, res, next) => {
  const scope = String(req.query.scope ?? 'global').toLowerCase();
  if (!SCOPES.includes(scope)) {
    return res.status(400).json({ error: `scope must be one of: ${SCOPES.join(', ')}` });
  }
  let layers = null;
  if (req.query.layers !== undefined) {
    layers = String(req.query.layers).split(',').map((l) => l.trim().toLowerCase()).filter(Boolean);
    const unknown = layers.filter((l) => !LAYERS.includes(l));
    if (unknown.length) {
      return res.status(400).json({ error: `unknown layer(s): ${unknown.join(', ')}. Valid: ${LAYERS.join(', ')}` });
    }
  }
  let center = null;
  if (scope === 'local' && req.query.lat !== undefined && req.query.lng !== undefined) {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180) {
      center = { lat, lng };
    }
  }
  try {
    res.json(await getEvents(scope, layers, center));
  } catch (err) {
    next(err);
  }
});

// GET /health
//   feeds   { key: status }  (legacy shape, kept)
//   sources { key: { label, layer, status: live|mock|down|disabled, stale, count, lastSuccess, lastError, ... } }
//   layers  { layer: eventCount }
//   liveSources  number of real (non-simulated) sources currently live
app.get('/health', async (req, res, next) => {
  try {
    const { events, feeds, sources, layers, liveSources } = await getSourceReport();
    res.json({ status: 'ok', mode: config.useMock ? 'mock' : 'live', feeds, count: events.length, liveSources, layers, sources });
  } catch (err) {
    next(err);
  }
});
app.get('/api/wards', (req, res) => res.json(wards));
app.get('/api/wards/:id', (req, res) => { const ward = getWard(req.params.id); return ward ? res.json(ward) : res.status(404).json({ error: 'ward not found' }); });

// GET /api/brief?lat=..&lng=..  (defaults to Amer)
// One-line "now + next hours + what to do" summary for a point, plus the structured items.
// Reads cached events and the point's cached hourly forecast; a cold point starts a
// background forecast fetch and answers with forecast.pending=true (poll again shortly).
app.get('/api/brief', async (req, res, next) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const center = Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng } : { ...AMER };
  try {
    res.json(await buildBrief(center));
  } catch (err) {
    next(err);
  }
});

// GET /api/sources - one row per source (live and planned/disabled), for the frontend's
// "Data Sources" panel. keyConfigured is a boolean only; no key value is ever included.
app.get('/api/sources', async (req, res, next) => {
  try {
    res.json(await getSourcesApiReport());
  } catch (err) {
    next(err);
  }
});

// feat/local and feat/globe's cache-backed pipeline (see docs/CONTRACT.md). Additive:
// the routes above are untouched.
app.use('/api/local', require('./routes/local'));
app.use('/api/globe', require('./routes/globe'));

app.use((req, res) => res.status(404).json({ error: 'not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] request failed:', err);
  res.status(500).json({ error: 'internal error' });
});

// Safety net: a stray rejected promise must not take the server down.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
});

if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`CitySync API listening on http://localhost:${config.port}`);
    console.log(
      config.useMock
        ? '[mode] USE_MOCK=true - serving events.json only, no network calls'
        : `[mode] live feeds (USGS, Open-Meteo + world city grid, GDELT, NDMA SACHET) + simulated Amer feed; local scope = ${LOCAL_RADIUS_KM} km around ${AMER.lat}, ${AMER.lng}`,
    );
    loadMockEvents().then((mock) => console.log(`[mock] ${MOCK_PATH} - ${mock.length} valid event(s)`));
    // Populate the slow Overpass exposure snapshot asynchronously on startup; the exposure
    // adapter only ever reads its file, never triggers this itself.
    const exposureBuild = spawn(process.execPath, ['scripts/fetch-exposure.js'], { cwd: __dirname, stdio: 'ignore', windowsHide: true });
    exposureBuild.unref();
    // Background refresh: every source on its own timer (including the ones above);
    // endpoints only read the cache.
    if (!config.useMock) prefetchHourlyForecast(AMER.lat, AMER.lng);
    startScheduler().catch((err) => console.error('[server] scheduler failed to start:', err));
  });
  server.on('error', (err) => {
    console.error(
      err.code === 'EADDRINUSE'
        ? `Port ${config.port} is already in use. Set a different PORT in .env or the environment.`
        : `Server error: ${err.message}`,
    );
    process.exit(1);
  });
}

module.exports = app;
