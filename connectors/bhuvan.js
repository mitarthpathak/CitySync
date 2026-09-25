'use strict';

const config = require('../lib/config');

// TODO(bhuvan): NOT INTEGRATED. Placeholder so the architecture shows it is planned.
//
// Why not tonight: Bhuvan (NRSC) OGC services need a registered token and per-layer WMS/WFS mapping.
// When built: implement `run()` returning normalized events via lib/event.makeEvent,
// with layer "climate" and an honest tag, then remove `planned` and register it in lib/sources.js.
module.exports = {
  key: 'bhuvan',
  label: 'ISRO Bhuvan geoportal (planned)',
  layer: 'climate',
  category: 'Climate',
  planned: true,
  requiresKey: true,
  keyConfigured: Boolean(config.keys.bhuvanKey),
  attribution: 'ISRO Bhuvan (NRSC)',
  docsUrl: 'https://bhuvan.nrsc.gov.in/',
  reason: 'Bhuvan (NRSC) OGC services need a registered token and per-layer WMS/WFS mapping; Tier 2, deferred so Tier 1 stayed complete and stable within the time budget.',
  run: async () => {
    throw new Error('bhuvan connector is a planned stub, not implemented');
  },
};
