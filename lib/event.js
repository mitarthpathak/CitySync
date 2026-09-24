'use strict';

const EVENT_TYPES = [
  'earthquake', 'weather', 'air_quality', 'traffic', 'crowd', 'civic', 'event',
  'news', 'alert', 'climate', 'anomaly', 'waterlogging', 'exposure',
];

// Toggleable globe layers. Every event belongs to exactly one.
const LAYERS = [
  'earthquakes', 'weather', 'air_quality', 'news', 'alerts', 'climate', 'anomaly', 'simulated',
  'waterlogging_risk', 'aqi_station', 'exposure', 'historical_baseline', 'traffic', 'industrial_context', 'pois',
];

// How much to trust an event, stated honestly:
//   REAL_LIVE       measured / issued by an authority, current
//   REAL_STATIC     real measured data, but not live (daily reanalysis, climatology)
//   MEDIA_REPORTED  derived from news coverage; a mention, not a confirmed incident
//   ESTIMATED       modelled / inferred
//   SIMULATED       generated or mock data
const TAGS = ['REAL_LIVE', 'REAL_STATIC', 'MEDIA_REPORTED', 'ESTIMATED', 'SIMULATED'];

const DEFAULT_LAYER = {
  earthquake: 'earthquakes',
  weather: 'weather',
  air_quality: 'air_quality',
  news: 'news',
  alert: 'alerts',
  climate: 'climate',
  anomaly: 'anomaly',
  waterlogging: 'waterlogging_risk',
  exposure: 'exposure',
};
const DEFAULT_TAG = { news: 'MEDIA_REPORTED', climate: 'REAL_STATIC', anomaly: 'REAL_STATIC', waterlogging: 'MEDIA_REPORTED', exposure: 'REAL_STATIC' };

/**
 * Fill layer / tag / sourceUrl for events that predate them (the original four feeds,
 * events.json). Explicit values win. Simulated data is always tagged SIMULATED, whatever
 * the caller asked for, so a mock can never pose as a live reading.
 */
function withDefaults(e) {
  // traffic / crowd / civic / event only ever come from the Amer simulator (or its mock)
  // unless an adapter sets its own layer explicitly (e.g. TomTom -> 'traffic').
  const layer = e.layer ?? DEFAULT_LAYER[e.type] ?? 'simulated';
  const tag = e.isSimulated ? 'SIMULATED' : e.tag ?? DEFAULT_TAG[e.type] ?? 'REAL_LIVE';
  return { ...e, layer, tag, sourceUrl: typeof e.sourceUrl === 'string' && e.sourceUrl ? e.sourceUrl : null };
}

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
  // Added fields: optional on input (withDefaults fills them), but must be valid when present.
  if (e.layer !== undefined && !LAYERS.includes(e.layer)) return `unknown layer "${e.layer}"`;
  if (e.tag !== undefined && !TAGS.includes(e.tag)) return `unknown tag "${e.tag}"`;
  if (e.sourceUrl !== undefined && e.sourceUrl !== null && typeof e.sourceUrl !== 'string') {
    return 'sourceUrl must be a string or null';
  }
  return null;
}

/**
 * Build a normalized event. Every adapter goes through this, so nothing malformed
 * can reach the aggregate. Throws on bad input; adapters decide whether to skip.
 */
function makeEvent({
  id, type, title, lat, lng, timestamp, severity, source, isSimulated = false, raw = {}, layer, tag, sourceUrl, ward_id = null,
}) {
  const event = withDefaults({
    id: String(id),
    type,
    title,
    lat,
    lng,
    timestamp: new Date(timestamp).toISOString(), // throws RangeError on an invalid date
    severity: Math.min(5, Math.max(1, Math.round(severity))),
    source,
    isSimulated,
    raw,
    layer,
    tag,
    sourceUrl,
    ward_id: ward_id === null ? null : String(ward_id),
  });
  const problem = validateEvent(event);
  if (problem) throw new Error(`invalid ${type} event (${event.id}): ${problem}`);
  return event;
}

module.exports = { EVENT_TYPES, LAYERS, TAGS, validateEvent, makeEvent, withDefaults };
