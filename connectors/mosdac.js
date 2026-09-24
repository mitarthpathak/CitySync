'use strict';

// TODO(mosdac): NOT INTEGRATED. Placeholder so the architecture shows it is planned.
//
// Why not tonight: ISRO MOSDAC data needs a registered account and its download API; no keyless feed.
// When built: implement `run()` returning normalized events via lib/event.makeEvent,
// with layer "climate" and an honest tag, then remove `planned` and register it in lib/sources.js.
module.exports = {
  key: 'mosdac',
  label: 'ISRO MOSDAC satellite products (planned)',
  layer: 'climate',
  planned: true,
  reason: 'ISRO MOSDAC data needs a registered account and its download API; no keyless feed.',
  run: async () => {
    throw new Error('mosdac connector is a planned stub, not implemented');
  },
};
