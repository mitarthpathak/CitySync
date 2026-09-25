import { AirVent, Car, CloudRain, Droplets, FlaskConical, Newspaper, Radio, Siren, Thermometer, TrendingUp, Umbrella, Waves } from 'lucide-react'

// Single source of truth for the globe's toggleable layers: chip label, icon, legend glyph,
// and how an event maps to a layer when an older backend did not send `layer`.
// Order = chip order (highest-trust first after the classic three).

export const LAYERS = [
  { id: 'alerts', label: 'Official Alerts', Icon: Siren, glyph: 'alert', hint: 'Official warnings: NDMA SACHET (India), WMO national met services (Russia, Europe, S. America, N. Africa), GDACS disasters worldwide. Brightest pulse: highest trust.' },
  { id: 'earthquakes', label: 'Earthquakes', Icon: Waves, glyph: 'quake', hint: 'USGS. Ring radius scales with magnitude.' },
  { id: 'weather', label: 'Weather', Icon: CloudRain, glyph: 'weather', hint: 'Open-Meteo current conditions.' },
  { id: 'air_quality', label: 'Air Quality', Icon: AirVent, glyph: 'aq', hint: 'Open-Meteo AQ. Disc colour = US AQI band.' },
  { id: 'aqi_station', label: 'AQI Stations', Icon: Radio, glyph: 'aqi-station', hint: 'WAQI ground stations, compared against the modelled reading above - a gap between them is shown, not hidden.' },
  { id: 'traffic', label: 'Traffic', Icon: Car, glyph: 'traffic', hint: 'TomTom real-time flow + incidents where available; the Amer simulator fills in elsewhere, always badged SIMULATED.' },
  { id: 'flood_forecast', label: 'Flood Forecast', Icon: Droplets, glyph: 'flood', hint: 'Open-Meteo Flood (GloFAS): MODELLED river discharge forecast, never a measured gauge reading.' },
  { id: 'rain_forecast', label: 'Rain Forecast', Icon: Umbrella, glyph: 'rain-forecast', hint: 'Open-Meteo forecast probability, not observed rain - a possibility, not a confirmed prediction.' },
  { id: 'news', label: 'News', Icon: Newspaper, glyph: 'news', hint: 'GDELT media mentions: weakest signal, never a confirmed incident.' },
  { id: 'climate', label: 'Climate', Icon: Thermometer, glyph: 'climate', hint: 'NASA POWER daily temperature + rain (a few days behind, not live).' },
  { id: 'anomaly', label: 'Anomalies', Icon: TrendingUp, glyph: 'anomaly', hint: 'Latest archived daily max far from the 10-year normal for that date (Open-Meteo ERA5).' },
  { id: 'simulated', label: 'Simulated', Icon: FlaskConical, glyph: 'sim', hint: 'Generated Amer demo feed. Not real.' },
]
export const LAYER_IDS = LAYERS.map((l) => l.id)
export const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l]))

const LAYER_OF_TYPE = {
  earthquake: 'earthquakes', weather: 'weather', air_quality: 'air_quality', news: 'news',
  alert: 'alerts', climate: 'climate', anomaly: 'anomaly', traffic: 'traffic',
  flood: 'flood_forecast', rain_forecast: 'rain_forecast',
}

/** The event's layer; falls back by type for events from a backend that predates `layer`. */
export const layerOf = (e) => (LAYER_BY_ID[e.layer] ? e.layer : LAYER_OF_TYPE[e.type] ?? 'simulated')

/** The event's trust tag; simulated data is always SIMULATED whatever else it says. */
export function tagOf(e) {
  if (e.isSimulated) return 'SIMULATED'
  if (TAGS[e.tag]) return e.tag
  return e.type === 'news' ? 'MEDIA_REPORTED' : 'REAL_LIVE'
}

// `badge`: the short, loud label shown on the globe tooltip, the ticker and the panel for
// anything that is NOT a live measurement. Live data carries no badge.
export const TAGS = {
  REAL_LIVE: { label: 'Live data', badge: null },
  REAL_STATIC: { label: 'Real data, not live', badge: 'STATIC' },
  MEDIA_REPORTED: { label: 'Media mentions, not confirmed', badge: 'MEDIA' },
  ESTIMATED: { label: 'Estimated', badge: 'ESTIMATED' },
  SIMULATED: { label: 'Simulated, not real', badge: 'SIMULATED' },
}

/** Only ever link to http(s): sourceUrl comes from third-party feeds. */
export function safeUrl(url) {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

/**
 * Roll up /health `sources` into one status per layer:
 * live if any real source on it is live, else mock, else down; null when nothing feeds it.
 */
export function layerStatuses(sources) {
  const out = {}
  for (const src of Object.values(sources ?? {})) {
    if (!src || src.status === 'disabled' || !LAYER_BY_ID[src.layer]) continue
    const status = src.status === 'sim' ? 'live' : src.status
    const current = out[src.layer]
    const rank = { live: 3, mock: 2, down: 1 }
    if (!current || (rank[status] ?? 0) > (rank[current] ?? 0)) out[src.layer] = status
  }
  return out
}
