'use strict';

// Stub for feat/globe. Owned by feat/globe past this point - see docs/CONTRACT.md.
// Real version: a scheduled job in jobs/globe/** calls writeCache('globe', ...) on
// an interval; adapters live in adapters/globe/**; thresholds in config/globe/**.
// This stub writes one placeholder envelope at require-time purely so the route
// has something honest to serve before that job exists.

const express = require('express');
const { writeCache, readCache } = require('../lib/cache');
const { TAGS, envelope } = require('../lib/envelope');

writeCache(
  'globe',
  envelope({
    data: { message: 'feat/globe has not implemented a scheduled job yet' },
    source: 'stub',
    tag: TAGS.SIMULATED,
    confidence: 0,
  }),
);

const router = express.Router();

// GET /api/globe - reads the cache only, never calls an external API.
router.get('/', (req, res) => {
  const snapshot = readCache('globe');
  if (!snapshot) {
    return res.status(503).json(envelope({ source: 'globe', tag: TAGS.SIMULATED, confidence: 0, error: 'not ready: no scheduled job has run yet' }));
  }
  res.json(snapshot);
});

module.exports = router;
