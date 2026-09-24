'use strict';

// Project heuristics, not official municipal thresholds. Tune only here.
module.exports = Object.freeze({
  waterlogging: { nextHours: 3, rainNextHoursMm: 4, rain48HoursMm: 12, highScore: 70, mediumScore: 35 },
  aqi: { lowConfidenceGap: 35 },
  jaipurBounds: { south: 26.72, west: 75.65, north: 27.12, east: 76.02 },
});
