/**
 * @typedef {'REAL_LIVE'|'REAL_STATIC'|'MEDIA_REPORTED'|'ESTIMATED'|'SIMULATED'} HonestyTag
 *
 * @typedef {Object} Envelope
 * @property {boolean} ok
 * @property {string} generatedAt ISO timestamp
 * @property {string} source
 * @property {HonestyTag} tag
 * @property {boolean} stale
 * @property {number} confidence 0..1
 * @property {*} data
 * @property {string} [error]
 */

// Mirrors lib/envelope.js's TAGS on the backend. Kept as a plain JS constant (this
// repo has no TypeScript) with the shape documented via the JSDoc typedefs above.
export const TAGS = Object.freeze({
  REAL_LIVE: 'REAL_LIVE',
  REAL_STATIC: 'REAL_STATIC',
  MEDIA_REPORTED: 'MEDIA_REPORTED',
  ESTIMATED: 'ESTIMATED',
  SIMULATED: 'SIMULATED',
});

/**
 * Unwraps a fetch Response for a /api/local or /api/globe endpoint into its
 * {@link Envelope}, regardless of whether the server answered 200 or 503 - both
 * shapes carry the same envelope fields, only `ok`/`error` differ.
 * @param {Response} response
 * @returns {Promise<Envelope>}
 */
export async function unwrapEnvelope(response) {
  return response.json();
}
