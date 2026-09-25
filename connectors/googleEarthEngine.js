'use strict';

const config = require('../lib/config');

// TODO(gee): NOT INTEGRATED. Placeholder so the architecture shows it is planned.
//
// Why not tonight: needs a Python (earthengine-api) service + Google Cloud service-account auth.
// When built: implement `run()` returning normalized events via lib/event.makeEvent,
// with layer "climate" and an honest tag, then remove `planned` and register it in lib/sources.js.
module.exports = {
  key: 'gee',
  label: 'Google Earth Engine (planned)',
  layer: 'climate',
  category: 'Climate',
  planned: true,
  requiresKey: true,
  keyConfigured: config.keys.earthEngineConfigured,
  attribution: 'Google Earth Engine',
  docsUrl: 'https://developers.google.com/earth-engine',
  reason: 'needs a Python (earthengine-api) service + Google Cloud service-account auth.',
  run: async () => {
    throw new Error('gee connector is a planned stub, not implemented');
  },
};
