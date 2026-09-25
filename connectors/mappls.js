'use strict';

const config = require('../lib/config');

// TODO(mappls): NOT INTEGRATED YET. Tier 2, deferred so Tier 1 stayed complete and stable
// within the time budget - not blocked on anything technical.
//
// When built: Mappls may need an OAuth client id/secret flow rather than a single API
// key; if MAPPLS_API_KEY doesn't authenticate on its own, mark this "disabled" and move
// on rather than spending time on it. Implement `run()` returning normalized events via
// lib/event.makeEvent, then remove `planned` and register it in lib/sources.js.
module.exports = {
  key: 'mappls',
  label: 'Mappls geocoding (India, planned)',
  layer: 'pois',
  category: 'Geocoding',
  planned: true,
  requiresKey: true,
  keyConfigured: Boolean(config.keys.mapplsApiKey),
  attribution: 'Mappls (MapmyIndia)',
  docsUrl: 'https://www.mappls.com/api/',
  reason: 'Tier 2, deferred to keep Tier 1 complete within the time budget.',
  run: async () => {
    throw new Error('mappls connector is a planned stub, not implemented');
  },
};
