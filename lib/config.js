'use strict';

const path = require('path');

// .env is optional; every value has a default so `npm install && npm start` just works.
// Anchored to the project root so it loads no matter which directory the server is started from.
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

module.exports = {
  port: Number(process.env.PORT) || 3000,

  // When true: serve ONLY events.json, make zero network calls.
  // Either USE_MOCK=true or the `--mock` flag (works the same on Windows, macOS, Linux).
  useMock: isTruthy(process.env.USE_MOCK) || process.argv.includes('--mock'),

  // Per-request budget for one upstream call.
  fetchTimeoutMs: 6000,

  // A good upstream answer is reused this long (protects upstream rate limits when the
  // frontend polls). A failed answer is remembered briefly so an outage is not re-hit
  // (and re-logged) on every request.
  cacheTtlMs: 60 * 1000,
  failureTtlMs: 15 * 1000,
};
