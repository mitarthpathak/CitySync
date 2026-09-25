'use strict';

// TODO(jctsl-ptal): NOT INTEGRATED YET. Tier 2, deferred so Tier 1 stayed complete and
// stable within the time budget - not blocked on anything technical.
//
// When built: import bus routes/stops from https://github.com/SoniAnmol/JCTSL-PTAL as a
// ONE-TIME static file committed to public/data/ (no runtime dependency, no key). Layer
// "transit", tag "REAL_STATIC"; live transit delays would stay SIMULATED (no live feed
// exists). Then remove `planned` and register it in lib/sources.js.
module.exports = {
  key: 'jctslPtal',
  label: 'JCTSL bus routes/stops, Jaipur (planned)',
  layer: 'transit',
  category: 'Transit',
  planned: true,
  requiresKey: false,
  attribution: 'JCTSL-PTAL (community dataset)',
  docsUrl: 'https://github.com/SoniAnmol/JCTSL-PTAL',
  reason: 'Tier 2, deferred to keep Tier 1 complete within the time budget.',
  run: async () => {
    throw new Error('jctslPtal connector is a planned stub, not implemented');
  },
};
