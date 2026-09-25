// Preset locations for the LOCAL view's location selector. Add more entries here —
// nothing else needs to change; the dropdown, map centering and header all read this list.

export const DEFAULT_LOCATION_ID = 'amer-jaipur';

export const LOCATIONS = [
  { id: 'amer-jaipur', label: 'Amer, Jaipur', region: 'Rajasthan, India', lat: 26.9855, lng: 75.8513 },
  { id: 'achrol-amity', label: 'Achrol / Amity University', region: 'Rajasthan, India', lat: 27.1764, lng: 75.9568 },
  { id: 'jaipur-city', label: 'Jaipur City', region: 'Rajasthan, India', lat: 26.9124, lng: 75.7873 },
  { id: 'delhi', label: 'Delhi', region: 'Delhi, India', lat: 28.6139, lng: 77.209 },
  { id: 'mumbai', label: 'Mumbai', region: 'Maharashtra, India', lat: 19.076, lng: 72.8777 },
  { id: 'bengaluru', label: 'Bengaluru', region: 'Karnataka, India', lat: 12.9716, lng: 77.5946 },
];

export const DEFAULT_LOCATION = LOCATIONS.find((l) => l.id === DEFAULT_LOCATION_ID) ?? LOCATIONS[0];

export function findLocationById(id) {
  return LOCATIONS.find((l) => l.id === id);
}

/** Wrap a plain {lat, lng} (e.g. from geolocation) so it matches the shape of a preset. */
export function toCustomLocation(lat, lng, label = 'My location') {
  return { id: 'custom', label, region: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng };
}
