'use strict';

const EVENT_TYPES = ['earthquake', 'weather', 'air_quality', 'traffic', 'crowd', 'civic', 'event', 'waterlogging', 'news', 'exposure'];
const TAGS = ['REAL_LIVE', 'REAL_STATIC', 'MEDIA_REPORTED', 'ESTIMATED', 'SIMULATED'];

/** Returns a problem description, or null when `e` matches the common event schema. */
function validateEvent(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'not an object';
  if (typeof e.id !== 'string' || !e.id) return 'id must be a non-empty string';
  if (!EVENT_TYPES.includes(e.type)) return `unknown type "${e.type}"`;
  if (typeof e.title !== 'string' || !e.title) return 'title must be a non-empty string';
  if (!Number.isFinite(e.lat) || Math.abs(e.lat) > 90) return 'lat must be a number in [-90, 90]';
  if (!Number.isFinite(e.lng) || Math.abs(e.lng) > 180) return 'lng must be a number in [-180, 180]';
  if (typeof e.timestamp !== 'string' || Number.isNaN(Date.parse(e.timestamp))) {
    return 'timestamp must be an ISO 8601 string';
  }
  if (!Number.isInteger(e.severity) || e.severity < 1 || e.severity > 5) {
    return 'severity must be an integer 1..5';
  }
  if (typeof e.source !== 'string' || !e.source) return 'source must be a non-empty string';
  if (typeof e.isSimulated !== 'boolean') return 'isSimulated must be a boolean';
  if (typeof e.layer !== 'string' || !e.layer) return 'layer must be a non-empty string';
  if (!TAGS.includes(e.tag)) return 'tag must be a supported provenance tag';
  if (e.sourceUrl !== null && typeof e.sourceUrl !== 'string') return 'sourceUrl must be a string or null';
  if (e.ward_id !== null && typeof e.ward_id !== 'string') return 'ward_id must be a string or null';
  if (!e.raw || typeof e.raw !== 'object' || Array.isArray(e.raw)) return 'raw must be an object';
  return null;
}

/**
 * Build a normalized event. Every adapter goes through this, so nothing malformed
 * can reach the aggregate. Throws on bad input; adapters decide whether to skip.
 */
function makeEvent({ id, type, title, lat, lng, timestamp, severity, source, isSimulated = false, layer = 'signals', tag = isSimulated ? 'SIMULATED' : 'REAL_LIVE', sourceUrl = null, ward_id = null, raw = {} }) {
  const event = {
    id: String(id),
    type,
    title,
    lat,
    lng,
    timestamp: new Date(timestamp).toISOString(), // throws RangeError on an invalid date
    severity: Math.min(5, Math.max(1, Math.round(severity))),
    source,
    isSimulated,
    layer,
    tag,
    sourceUrl,
    ward_id: ward_id === null ? null : String(ward_id),
    raw,
  };
  const problem = validateEvent(event);
  if (problem) throw new Error(`invalid ${type} event (${event.id}): ${problem}`);
  return event;
}

module.exports = { EVENT_TYPES, TAGS, validateEvent, makeEvent };
