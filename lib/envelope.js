'use strict';

// Honesty tags every datum in the local/globe pipeline must carry. SIMULATED must
// always stay visibly tagged in the UI — never disguised as real.
const TAGS = Object.freeze({
  REAL_LIVE: 'REAL_LIVE',
  REAL_STATIC: 'REAL_STATIC',
  MEDIA_REPORTED: 'MEDIA_REPORTED',
  ESTIMATED: 'ESTIMATED',
  SIMULATED: 'SIMULATED',
});

/**
 * Build the shared response envelope: { ok, generatedAt, source, tag, stale,
 * confidence, data, error? }. `ok` defaults to whether `error` was given, so
 * routes don't have to repeat that logic at every call site.
 */
function envelope({ data = null, source, tag, stale = false, confidence = 1, error = null, ok } = {}) {
  if (!Object.values(TAGS).includes(tag)) {
    throw new Error(`envelope(): unknown tag "${tag}" - must be one of ${Object.values(TAGS).join(', ')}`);
  }
  const built = {
    ok: ok ?? !error,
    generatedAt: new Date().toISOString(),
    source,
    tag,
    stale,
    confidence,
    data,
  };
  if (error) built.error = error;
  return built;
}

module.exports = { TAGS, envelope };
