'use strict';

// Project heuristics, not official municipal thresholds. Tune only here.
module.exports = Object.freeze({
  // score = rainNextWeight * (next-hours rain / rainNextHoursMm) + rain48Weight * (last
  // 48h rain / rain48HoursMm) + probabilityWeight * (avg precipitation_probability% / 100),
  // each term capped at its own weight. Weights sum to 100 (percentage points).
  waterlogging: {
    nextHours: 3, rainNextHoursMm: 4, rain48HoursMm: 12,
    rainNextWeight: 40, rain48Weight: 35, probabilityWeight: 25,
    highScore: 70, mediumScore: 35,
  },
  aqi: { lowConfidenceGap: 35 },
  // North bound extended past the city to 27.22 so it also covers Achrol / Amity
  // University (27.13-27.18), the second local point.
  jaipurBounds: { south: 26.72, west: 75.65, north: 27.22, east: 76.02 },
});
