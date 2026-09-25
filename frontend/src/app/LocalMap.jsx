import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Circle, GeoJSON, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { LocateFixed, Map as MapIcon, Maximize2, Minimize2, Satellite } from 'lucide-react'
import { toneOf } from '../lib/severity.js'
import { useReducedMotion } from '../lib/useReducedMotion.js'
import { useTheme } from './useTheme.js'

// Free, keyless Esri "gray canvas" basemaps: a base layer plus a matching label/roads
// layer on top. (CartoDB's anonymous basemaps started requiring a key partway through this
// build — its tiles now render an "API KEY REQUIRED" watermark — so this project uses Esri's
// keyless ArcGIS Online basemaps instead.) Esri only serves these up to native zoom 16.
const ESRI_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const ESRI_SERVICES = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const TILE_URL = {
  light: `${ESRI_BASE}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
  dark: `${ESRI_BASE}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
}
const LABEL_URL = {
  light: `${ESRI_BASE}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
  dark: `${ESRI_BASE}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
}
const SATELLITE_URL = `${ESRI_SERVICES}/World_Imagery/MapServer/tile/{z}/{y}/{x}`
const SATELLITE_LABEL_URL = `${ESRI_SERVICES}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`
const TILE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
const ESRI_MAX_ZOOM = 16

const ZONE_COLOR = { light: '#2762c9', dark: '#6a9bff' }
const TRANSIT_COLOR = { light: '#7a4fc4', dark: '#b894ff' }
const ROUTE_COLOR = { light: '#1f8a5b', dark: '#5fd49a' }
// Static JCTSL bus-route overlay, built by scripts/fetch-jctsl-ptal.js into frontend/public.
const JCTSL_ROUTES_URL = '/data/jctsl-routes.geojson'
const DEFAULT_ZOOM = 12

// Reuses the app's existing pin shape/markup (see the earlier illustrative LocalMap) as a
// Leaflet divIcon, so a marker on the real map looks identical to before. `dashed` marks a
// FORECAST event (ESTIMATED tag: modelled, not measured) with a dashed outline + hollow
// center, so prediction vs. observation is obvious at a glance without a new pin shape.
function pinIcon(tone, { halo = false, dashed = false } = {}) {
  return L.divIcon({
    // `cp-tone-${tone}` isn't styled itself - it's just how a cluster (see clusterIcon
    // below) reads back a clustered marker's severity tier without re-deriving it.
    className: `cp-leaflet-pin cp-tone-${tone}`,
    html:
      `<span class="cp-pin cp-pin--${tone}${dashed ? ' cp-pin--forecast' : ''}">` +
      (halo ? '<i class="cp-pin-halo"></i><i class="cp-pin-ring"></i>' : '') +
      '<svg class="cp-pin-icon" width="24" height="28" viewBox="0 0 24 28" aria-hidden="true">' +
      `<path d="M12 27.2 4.46 20.55A11.4 11.4 0 1 1 19.54 20.55Z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"${dashed ? ' stroke-dasharray="2.5 2"' : ''}></path>` +
      `<circle cx="12" cy="12" r="3" fill="${dashed ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="${dashed ? '1.25' : '0'}"></circle>` +
      '</svg></span>',
    iconSize: [24, 28],
    iconAnchor: [12, 28],
  })
}

const TONE_RANK = { blue: 0, amber: 1, crimson: 2 }

/** A clustered pile of markers, zoomed out: one badge showing the count, tinted by the
 * highest severity tier inside it - so a cluster hiding a critical alert still reads red. */
function clusterIcon(cluster) {
  const count = cluster.getChildCount()
  const tone = cluster.getAllChildMarkers().reduce((worst, marker) => {
    const className = marker.options.icon?.options?.className || ''
    const markerTone = className.includes('cp-tone-crimson') ? 'crimson' : className.includes('cp-tone-amber') ? 'amber' : 'blue'
    return TONE_RANK[markerTone] > TONE_RANK[worst] ? markerTone : worst
  }, 'blue')
  const size = count >= 50 ? 46 : count >= 10 ? 38 : 30
  return L.divIcon({
    className: 'cp-cluster-wrap',
    html: `<span class="cp-cluster cp-cluster--${tone}">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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
  const [busRoutes, setBusRoutes] = useState(null)
  const [satellite, setSatellite] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const showTransit = layers.transit !== false
  useEffect(() => {
    if (!showTransit || busRoutes) return
    fetch(JCTSL_ROUTES_URL).then((r) => (r.ok ? r.json() : null)).then(setBusRoutes).catch(() => {})
  }, [showTransit, busRoutes])
  // Fullscreen toggle: expands the map card to cover the viewport. The container resize
  // happens mid-animation, so Leaflet's internal size cache goes stale until we nudge it
  // with invalidateSize() once the CSS animation (280ms) finishes.
  useEffect(() => {
    if (!isFullscreen) return
    const onKeyDown = (e) => { if (e.key === 'Escape') setIsFullscreen(false) }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [isFullscreen])
  useEffect(() => {
    const timer = setTimeout(() => mapRef.current?.invalidateSize({ animate: !reduced }), 320)
    return () => clearTimeout(timer)
  }, [isFullscreen, reduced])

  // Above 1100px the map fills the grid row's stretched height (see .cp-map in app.css), which
  // changes as the side column's content (e.g. the incident feed) grows or shrinks - keep
  // Leaflet's own size cache in sync whenever that actually happens, not just on our own toggles.
  useEffect(() => {
    const container = mapRef.current?.getContainer()
    if (!container || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Bhuvan access routes carry their road geometry as [lng, lat] line arrays in raw.
  const accessRoutes = events.filter((e) => e.layer === 'access_routes' && layers.access_routes !== false && Array.isArray(e.raw?.route_geometry))

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
    <div className={`cp-map${isFullscreen ? ' cp-map--fullscreen' : ''}`}>
      <MapContainer
        ref={mapRef}
        center={[center.lat, center.lng]}
        zoom={DEFAULT_ZOOM}
        minZoom={3}
        maxZoom={ESRI_MAX_ZOOM}
        className="cp-leaflet"
      >
        <TileLayer
          key={`base-${satellite ? 'satellite' : theme}`}
          url={satellite ? SATELLITE_URL : TILE_URL[theme]}
          attribution={TILE_ATTRIBUTION}
          maxNativeZoom={ESRI_MAX_ZOOM}
        />
        <TileLayer
          key={`labels-${satellite ? 'satellite' : theme}`}
          url={satellite ? SATELLITE_LABEL_URL : LABEL_URL[theme]}
          maxNativeZoom={ESRI_MAX_ZOOM}
        />

        <Circle
          center={[center.lat, center.lng]}
          radius={radiusKm * 1000}
          pathOptions={{ color: ZONE_COLOR[theme], weight: 1, opacity: 0.35, fillColor: ZONE_COLOR[theme], fillOpacity: 0.06 }}
        />

        <Marker position={[center.lat, center.lng]} icon={centerIcon} />

        {layers.wards !== false && wards && <GeoJSON data={wards} style={wardStyle} onEachFeature={onEachWard} />}

        {showTransit && busRoutes && (
          <GeoJSON
            data={busRoutes}
            style={{ color: TRANSIT_COLOR[theme], weight: 1.5, opacity: 0.55 }}
            onEachFeature={(feature, layer) => layer.bindTooltip(`JCTSL bus route ${feature.properties.route}`, { sticky: true })}
          />
        )}

        {accessRoutes.map((event) => (
          <Polyline
            key={`route-${event.id}`}
            positions={event.raw.route_geometry.map((line) => line.map(([lng, lat]) => [lat, lng]))}
            pathOptions={{ color: ROUTE_COLOR[theme], weight: 3, opacity: 0.75 }}
            eventHandlers={{ click: () => onSelectEvent?.(event) }}
          >
            <Tooltip sticky>{event.title}</Tooltip>
          </Polyline>
        ))}

        <MarkerClusterGroup iconCreateFunction={clusterIcon} showCoverageOnHover={false} spiderfyOnMaxZoom maxClusterRadius={50}>
          {events.filter((event) => layers[event.layer] !== false && (layers.simulated !== false || event.tag !== 'SIMULATED')).map((event) => (
            <Marker
              key={event.id}
              position={[event.lat, event.lng]}
              icon={pinIcon(toneOf(event.severity), { dashed: event.tag === 'ESTIMATED' })}
              eventHandlers={{ click: () => onSelectEvent?.(event) }}
            />
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {layers.wards !== false && <p className="cp-ward-attribution">OpenCity.in — Jaipur Municipal Corporation Wards Map</p>}

      {events.length === 0 && (
        <p className="cp-map-empty">No active signals within {radiusKm} km of this location.</p>
      )}

      <div className="cp-map-controls">
        <button type="button" onClick={recenter} aria-label="Recenter map">
          <LocateFixed />
        </button>
        <button
          type="button"
          className="cp-map-type-button"
          onClick={() => setSatellite((current) => !current)}
          aria-label={satellite ? 'Switch to standard map view' : 'Switch to satellite view'}
          aria-pressed={satellite}
          title={satellite ? 'Map view' : 'Satellite view'}
        >
          {satellite ? <MapIcon /> : <Satellite />}
        </button>
        <button
          type="button"
          onClick={() => setIsFullscreen((v) => !v)}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? <Minimize2 /> : <Maximize2 />}
        </button>
      </div>
    </div>
  )
}
