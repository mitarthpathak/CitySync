// Demo content for the live-overview screens. Everything here is static placeholder data
// (it mirrors the design mock-ups); wire it to the CitySync API (`GET /events`) when ready.

export const signals = {
  index: 72,
  delta: '4.2% since 12:00',
  cities: 118,
  countries: 42,
}

export const liveFeed = [
  { place: 'Pacific Ocean', text: 'M 5.8 · 43 km depth', ago: '2m ago' },
  { place: 'Jaipur, India', text: 'Moderate congestion near Amer Fort', ago: '4m ago' },
  { place: 'Tokyo, Japan', text: 'AQI 118 · Unhealthy for sensitive groups', ago: '7m ago' },
  { place: 'Lisbon, Portugal', text: 'Heavy rain warning', ago: '12m ago' },
]

export const severity = [
  { id: 'low', label: 'Low' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'high', label: 'High' },
]

export const area = {
  eyebrow: 'Area pulse / Rajasthan, India',
  name: 'Amer, Jaipur',
  headline: 'Amer is active.',
  summary: 'Heavy traffic near Amer Fort, moderate air quality, one power complaint in Kunda.',
  status: 'Active',
  updated: 'updated 18 sec ago',
}

export const tiles = [
  { id: 'aqi', icon: 'air', tone: 'amber', delta: '↑ 8%', deltaTone: 'amber', value: '86', unit: 'AQI', label: 'Air quality', sub: 'Moderate' },
  { id: 'temp', icon: 'temp', tone: 'muted', delta: '↑ 2°', deltaTone: 'fg', value: '31°', unit: 'C', label: 'Temperature', sub: 'Feels like 34°' },
  { id: 'traffic', icon: 'car', tone: 'amber', delta: '↑ 12%', deltaTone: 'amber', value: 'Moderate', label: 'Traffic', sub: 'Amer Fort corridor' },
  { id: 'incidents', icon: 'zap', tone: 'crimson', delta: 'new', deltaTone: 'crimson', value: '1', unit: 'active', label: 'Incidents', sub: 'Power complaint' },
  { id: 'crowd', icon: 'users', tone: 'blue', delta: '↓ 6%', deltaTone: 'blue', value: 'Quiet', label: 'Crowd level', sub: 'Amer Fort · 34%' },
]

export const correlation = {
  title: 'Traffic and air quality are moving together.',
  body: 'Both signals rose near the Amer Fort corridor over the last 40 minutes. This may be related, but it is not confirmed.',
  confidence: 2, // filled segments out of 3
  note: 'Confidence: moderate · 40 min window',
}

export const incidents = [
  { id: 1, tone: 'crimson', title: 'Power complaint', detail: 'Kunda · transformer issue reported', ago: '4m' },
  { id: 2, tone: 'amber', title: 'Traffic building', detail: 'Amer Fort road · northbound', ago: '8m' },
  { id: 3, tone: 'blue', title: 'Visitors easing', detail: 'Amer Fort · crowd level falling', ago: '14m' },
]
