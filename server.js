'use strict';

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const config = require('./lib/config');
const { getEvents, getSnapshot } = require('./lib/normalize');
const { loadMockEvents, MOCK_PATH } = require('./lib/mock');
const { AMER, LOCAL_RADIUS_KM } = require('./lib/geo');
const { wards, getWard } = require('./lib/wards');

const SCOPES = ['global', 'local'];

const app = express();
app.use(cors()); // all origins: the frontend is a separate Vite dev server

// GET /events?scope=global|local  (default global)
app.get('/events', async (req, res, next) => {
  const scope = String(req.query.scope ?? 'global').toLowerCase();
  if (!SCOPES.includes(scope)) {
    return res.status(400).json({ error: `scope must be one of: ${SCOPES.join(', ')}` });
  }
  try {
    res.json(await getEvents(scope));
  } catch (err) {
    next(err);
  }
});

// GET /health
app.get('/health', async (req, res, next) => {
  try {
    const { events, feeds } = await getSnapshot();
    res.json({ status: 'ok', mode: config.useMock ? 'mock' : 'live', feeds, count: events.length });
  } catch (err) {
    next(err);
  }
});
app.get('/api/wards', (req, res) => res.json(wards));
app.get('/api/wards/:id', (req, res) => { const ward = getWard(req.params.id); return ward ? res.json(ward) : res.status(404).json({ error: 'ward not found' }); });

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
        : `[mode] live feeds (USGS, Open-Meteo, Open-Meteo AQ) + simulated Amer feed; local scope = ${LOCAL_RADIUS_KM} km around ${AMER.lat}, ${AMER.lng}`,
    );
    loadMockEvents().then((mock) => console.log(`[mock] ${MOCK_PATH} - ${mock.length} valid event(s)`));
    // Populate the slow Overpass snapshot asynchronously on startup; routes only read its file.
    const exposureBuild = spawn(process.execPath, ['scripts/fetch-exposure.js'], { cwd: __dirname, stdio: 'ignore', windowsHide: true });
    exposureBuild.unref();
    // Warm the cache and print the live/mock status of each feed right at startup.
    getSnapshot().catch((err) => console.error('[server] warm-up failed:', err));
    // Upstream feeds are warmed/refreshed here; browser reads only this server cache.
    setInterval(() => getSnapshot().catch(() => {}), config.backgroundRefreshMs).unref();
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
