'use strict';

const config = require('../lib/config');

// TODO(iudx): NOT INTEGRATED. Placeholder so the architecture shows it is planned.
//
// Why not tonight: IUDX city data needs a consumer registration + access-token flow per dataset.
// When built: implement `run()` returning normalized events via lib/event.makeEvent,
// with layer "air_quality" (city sensors) and an honest tag, then remove `planned` and register it in lib/sources.js.
module.exports = {
  key: 'iudx',
  label: 'India Urban Data Exchange (planned)',
  layer: 'air_quality',
  category: 'Air Quality',
  planned: true,
  requiresKey: true,
  keyConfigured: Boolean(config.keys.iudxAuthToken),
  attribution: 'India Urban Data Exchange',
  docsUrl: 'https://www.iudx.org.in/',
  reason: 'IUDX city data needs a consumer registration + access-token flow per dataset.',
  run: async () => {
    throw new Error('iudx connector is a planned stub, not implemented');
  },
};
