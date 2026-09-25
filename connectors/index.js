'use strict';

// Planned connectors: architecture placeholders only. NONE of these make a network call.
// Each is listed in /health as "disabled" so the roadmap is visible without pretending
// the data exists. See the individual files for what each integration will need.
module.exports = [
  require('./googleEarthEngine'),
  require('./mosdac'),
  require('./bhuvan'),
  require('./iudx'),
  require('./worldpop'),
  require('./mappls'),
  require('./jctslPtal'),
];
