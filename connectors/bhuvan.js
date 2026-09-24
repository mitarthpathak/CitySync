'use strict';

// TODO(bhuvan): NOT INTEGRATED. Placeholder so the architecture shows it is planned.
//
// Why not tonight: Bhuvan (NRSC) OGC services need a registered token and per-layer WMS/WFS mapping.
// When built: implement `run()` returning normalized events via lib/event.makeEvent,
// with layer "climate" and an honest tag, then remove `planned` and register it in lib/sources.js.
module.exports = {
  key: 'bhuvan',
  label: 'ISRO Bhuvan geoportal (planned)',
  layer: 'climate',
  planned: true,
  reason: 'Bhuvan (NRSC) OGC services need a registered token and per-layer WMS/WFS mapping.',
  run: async () => {
    throw new Error('bhuvan connector is a planned stub, not implemented');
  },
};
