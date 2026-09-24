import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { Circle, GeoJSON, MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet'
import { Layers, LocateFixed } from 'lucide-react'
import { toneOf } from '../lib/severity.js'
import { useReducedMotion } from '../lib/useReducedMotion.js'
import { useTheme } from './useTheme.js'

// Free, keyless Esri "gray canvas" basemaps: a base layer plus a matching label/roads
// layer on top. (CartoDB's anonymous basemaps started requiring a key partway through this
// build — its tiles now render an "API KEY REQUIRED" watermark — so this project uses Esri's
// keyless ArcGIS Online basemaps instead.) Esri only serves these up to native zoom 16.
const ESRI_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const TILE_URL = {
  light: `${ESRI_BASE}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
  dark: `${ESRI_BASE}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
}
const LABEL_URL = {
  light: `${ESRI_BASE}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
  dark: `${ESRI_BASE}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
}
const TILE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
const ESRI_MAX_ZOOM = 16

const ZONE_COLOR = { light: '#2762c9', dark: '#6a9bff' }
const DEFAULT_ZOOM = 12

// Reuses the app's existing pin shape/markup (see the earlier illustrative LocalMap) as a
// Leaflet divIcon, so a marker on the real map looks identical to before.
function pinIcon(tone, { halo = false } = {}) {
  return L.divIcon({
    className: 'cp-leaflet-pin',
    html:
      `<span class="cp-pin cp-pin--${tone}">` +
      (halo ? '<i class="cp-pin-halo"></i><i class="cp-pin-ring"></i>' : '') +
      '<svg class="cp-pin-icon" width="24" height="28" viewBox="0 0 24 28" aria-hidden="true">' +
      '<path d="M12 27.2 4.46 20.55A11.4 11.4 0 1 1 19.54 20.55Z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"></path>' +
      '<circle cx="12" cy="12" r="3" fill="currentColor"></circle>' +
      '</svg></span>',
    iconSize: [24, 28],
    iconAnchor: [12, 28],
  })
}

/**
 * LocalMap: a real Leaflet map of activity around the chosen location.
 *
 *   <LocalMap center={{ lat, lng }} events={events} radiusKm={15} onSelectEvent={fn} />
 *
 * Theme (light/dark tiles) is read from the shared theme context, same as GlobeView, so
 * both children stay in sync without the parent having to pass it down explicitly.
 */
export default function LocalMap({ center, events = [], radiusKm, wards = null, layers = {}, onSelectEvent }) {
  const { dark } = useTheme()
  const reduced = useReducedMotion()
  const theme = dark ? 'dark' : 'light'

  const mapRef = useRef(null)
  const firstRender = useRef(true)
  const centerIcon = useMemo(() => pinIcon('blue', { halo: true }), [])

  // MapContainer's `center` prop only sets the *initial* view; recenter explicitly whenever
  // the selected location changes after that (skip the redundant call on first mount).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mapRef.current?.flyTo([center.lat, center.lng], mapRef.current.getZoom(), { animate: !reduced, duration: reduced ? 0 : 1 })
  }, [center.lat, center.lng, reduced])

  const recenter = () => mapRef.current?.flyTo([center.lat, center.lng], DEFAULT_ZOOM, { animate: !reduced })
  const wardStyle = (feature) => {
    const score = Number(feature.properties.score || 0)
    return { color: dark ? '#92b5ff' : '#245bb9', weight: 0.7, opacity: 0.55, fillColor: score >= 70 ? '#d34848' : score >= 35 ? '#d69b30' : '#3f80d8', fillOpacity: 0.12 + Math.min(score, 80) / 650 }
  }
  const onEachWard = (feature, layer) => {
    layer.bindTooltip(`${feature.properties.ward_name} · score ${feature.properties.score ?? 0}`, { sticky: true })
    layer.on({ click: () => onSelectEvent?.({ id: `ward-${feature.properties.ward_id}`, type: 'civic', title: feature.properties.ward_name, lat: center.lat, lng: center.lng, timestamp: new Date().toISOString(), severity: Math.max(1, Math.ceil((feature.properties.score || 0) / 25)), source: feature.properties.official ? 'OpenCity.in — Jaipur Municipal Corporation Wards Map' : 'CityPulse custom zone', isSimulated: false, layer: 'wards', tag: 'REAL_STATIC', sourceUrl: 'https://data.opencity.in/dataset/jaipur-municipal-corporation-wards-map', ward_id: feature.properties.ward_id, raw: { hazard_score: feature.properties.hazard_score || 0, exposure_score: feature.properties.exposure_score || 0, impact: feature.properties.impact || 0, confidence_score: feature.properties.confidence_score || 0, facility_count: feature.properties.facility_count || 0, note: feature.properties.official ? 'Official ward geometry.' : 'Custom Amer zone, not an official ward.' } }) })
  }

  return (
    <div className="cp-map">
      <MapContainer
        ref={mapRef}
        center={[center.lat, center.lng]}
        zoom={DEFAULT_ZOOM}
        minZoom={3}
        maxZoom={ESRI_MAX_ZOOM}
        className="cp-leaflet"
      >
        <TileLayer key={`base-${theme}`} url={TILE_URL[theme]} attribution={TILE_ATTRIBUTION} maxNativeZoom={ESRI_MAX_ZOOM} />
        <TileLayer key={`labels-${theme}`} url={LABEL_URL[theme]} maxNativeZoom={ESRI_MAX_ZOOM} />

        <Circle
          center={[center.lat, center.lng]}
          radius={radiusKm * 1000}
          pathOptions={{ color: ZONE_COLOR[theme], weight: 1, opacity: 0.35, fillColor: ZONE_COLOR[theme], fillOpacity: 0.06 }}
        />

        <Marker position={[center.lat, center.lng]} icon={centerIcon} />

        {layers.wards !== false && wards && <GeoJSON data={wards} style={wardStyle} onEachFeature={onEachWard} />}

        {events.filter((event) => layers[event.layer] !== false && (layers.simulated !== false || event.tag !== 'SIMULATED')).map((event) => (
          <Marker
            key={event.id}
            position={[event.lat, event.lng]}
            icon={pinIcon(toneOf(event.severity))}
            eventHandlers={{ click: () => onSelectEvent?.(event) }}
          />
        ))}
      </MapContainer>

      {layers.wards !== false && <p className="cp-ward-attribution">OpenCity.in — Jaipur Municipal Corporation Wards Map</p>}

      {events.length === 0 && (
        <p className="cp-map-empty">No active signals within {radiusKm} km of this location.</p>
      )}

      <div className="cp-map-controls">
        <button type="button" onClick={recenter} aria-label="Recenter map">
          <LocateFixed />
        </button>
        <button type="button" aria-label="Map layers">
          <Layers />
        </button>
      </div>
    </div>
  )
}
