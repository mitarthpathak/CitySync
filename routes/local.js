'use strict';

// Stub for feat/local. Owned by feat/local past this point - see docs/CONTRACT.md.
// Real version: a scheduled job in jobs/local/** calls writeCache('local', ...) on
// an interval; adapters live in adapters/local/**; thresholds in config/local/**.
// This stub writes one placeholder envelope at require-time purely so the route
// has something honest to serve before that job exists.

const express = require('express');
const { writeCache, readCache } = require('../lib/cache');
const { TAGS, envelope } = require('../lib/envelope');

writeCache(
  'local',
  envelope({
    data: { message: 'feat/local has not implemented a scheduled job yet' },
    source: 'stub',
    tag: TAGS.SIMULATED,
    confidence: 0,
  }),
);

const router = express.Router();

// GET /api/local - reads the cache only, never calls an external API.
router.get('/', (req, res) => {
  const snapshot = readCache('local');
  if (!snapshot) {
    return res.status(503).json(envelope({ source: 'local', tag: TAGS.SIMULATED, confidence: 0, error: 'not ready: no scheduled job has run yet' }));
  }
  res.json(snapshot);
});

module.exports = router;
