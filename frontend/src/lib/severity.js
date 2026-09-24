// Single source of truth for severity 1-5 styling, shared by GlobeView, LocalMap and EventPanel
// so a pin on the globe, a pin on the map and the panel's chip always agree on colour.

export const SEVERITY_COLORS = { 1: '#94a3b8', 2: '#34c26f', 3: '#f2b01e', 4: '#f97316', 5: '#ef3b4a' }; // slate, green, amber, orange, red
export const SEVERITY_NAMES = { 1: 'Info', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Critical' };

export const colorOf = (severity) => SEVERITY_COLORS[severity] || SEVERITY_COLORS[1];
export const nameOf = (severity) => SEVERITY_NAMES[severity] || SEVERITY_NAMES[1];

// The app's existing 3-tier palette (LOCAL view's map pins, legend) reuses the same three
// accent tokens already defined in app.css (--cp-blue / --cp-amber / --cp-crimson).
export function toneOf(severity) {
  if (severity >= 4) return 'crimson';
  if (severity === 3) return 'amber';
  return 'blue';
}

export const EVENT_TYPES = ['earthquake', 'weather', 'air_quality', 'traffic', 'crowd', 'civic', 'event', 'news', 'alert', 'climate', 'anomaly', 'waterlogging', 'exposure'];

/** True when `value` matches the exact backend event schema. */
export function isValidEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const e = value;
  return (
    typeof e.id === 'string' && e.id.length > 0 &&
    EVENT_TYPES.includes(e.type) &&
    typeof e.title === 'string' &&
    Number.isFinite(e.lat) && Math.abs(e.lat) <= 90 &&
    Number.isFinite(e.lng) && Math.abs(e.lng) <= 180 &&
    typeof e.timestamp === 'string' && !Number.isNaN(Date.parse(e.timestamp)) &&
    Number.isInteger(e.severity) && e.severity >= 1 && e.severity <= 5 &&
    typeof e.source === 'string' &&
    typeof e.isSimulated === 'boolean' &&
    !!e.raw && typeof e.raw === 'object' && !Array.isArray(e.raw)
  );
}
