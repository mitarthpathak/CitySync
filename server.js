'use strict';

const express = require('express');
const cors = require('cors');
const config = require('./lib/config');
const { getEvents, getSourceReport, startScheduler } = require('./lib/normalize');
const { LAYERS } = require('./lib/event');
const { loadMockEvents, MOCK_PATH } = require('./lib/mock');
const { AMER, LOCAL_RADIUS_KM } = require('./lib/geo');

const SCOPES = ['global', 'local'];

const app = express();
app.use(cors()); // all origins: the frontend is a separate Vite dev server

// GET /events?scope=global|local  (default global)
//            &layers=news,alerts,weather  (optional; default all layers)
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
  try {
    res.json(await getEvents(scope, layers));
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
    // Background refresh: every source on its own timer; endpoints only read the cache.
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
