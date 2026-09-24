'use strict';

/**
 * Open-Meteo with `timezone=auto` returns `current.time` as LOCAL wall-clock time
 * ("2026-09-24T15:45", no zone) plus `utc_offset_seconds`. Convert to a real UTC
 * instant. Falls back to "now" if either value is unusable.
 */
function openMeteoTimeToIso(localTime, utcOffsetSeconds) {
  const asIfUtc = Date.parse(`${localTime}Z`);
  if (Number.isNaN(asIfUtc) || !Number.isFinite(utcOffsetSeconds)) {
    return new Date().toISOString();
  }
  return new Date(asIfUtc - utcOffsetSeconds * 1000).toISOString();
}

module.exports = { openMeteoTimeToIso };
