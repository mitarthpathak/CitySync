import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import * as THREE from 'three'
import { Map as MapIcon, Satellite } from 'lucide-react'
import { colorOf, nameOf } from '../lib/severity.js'
import { formatAgo } from '../lib/time.js'
import { useReducedMotion } from '../lib/useReducedMotion.js'
import { LAYER_BY_ID, TAGS, layerOf, tagOf } from '../lib/layers.js'
import { useTheme } from './useTheme.js'
import './GlobeView.css'

/**
 * GlobeView: the GLOBAL view's 3D globe.
 *
 *   <GlobeView events={visibleEvents} onSelectEvent={(event) => ...} active />
 *
 * Props (all optional)
 *   events                validated events to draw (GlobalView owns fetching + layer filtering)
 *   totalCount            events before layer filtering, for the status pill
 *   loading, error, lastUpdated   fetch state from useEvents, for the status pill
 *   focus                 { event, at }: fly to and highlight this event (e.g. from the ticker)
 *   onSelectEvent(event)  called with the clicked event, exactly the backend shape
 *                         { id, type, title, lat, lng, timestamp, severity, source, isSimulated,
 *                           raw, layer, tag, sourceUrl }
 *   theme                 "light" | "dark"; defaults to the app theme (<html class="dark">)
 *   active                default true. When false, the render loop is paused (AppShell keeps
 *                         this component mounted-but-hidden while the Local view is shown,
 *                         since re-initialising the globe is expensive) — data still polls.
 *
 * It fills its parent (position: relative; width/height: 100%), so give the parent a size.
 */

// ---- config ---------------------------------------------------------------

const MAX_POINTS = 600 // three.js cost grows with meshes; keep the most severe / newest (before clustering)
const MAX_RINGS = 30 // animated rings cap; eligibility + priority in ringSpecOf below

// Local copies (served from /public/textures), so the demo works with no internet.
const texture = (file) => `${import.meta.env.BASE_URL}textures/${file}`
const MODES = {
  normal: { label: 'Normal', Icon: MapIcon, globeImageUrl: texture('earth-day.jpg'), bumpImageUrl: texture('earth-topology.png') },
  satellite: { label: 'Satellite', Icon: Satellite, globeImageUrl: texture('earth-blue-marble.jpg'), bumpImageUrl: texture('earth-topology.png') },
}
const MODE_KEY = 'cp.globeMode'

// Atmosphere is tuned per mode: Satellite's rich imagery reads well with a slightly stronger,
// more saturated glow; Normal's flatter map tiles stay subtler so the glow doesn't wash them out.
const ATMOSPHERE = {
  normal: { light: '#8fb8ff', dark: '#4d8dff', altitude: 0.16 },
  satellite: { light: '#7fd4ff', dark: '#2f7fe0', altitude: 0.26 },
}

const HOME_VIEW = { lat: 26.9855, lng: 75.8513 } // Amer, Jaipur
const HOME_ALTITUDE = 1.5 // camera height in globe radii; 1.5 fills a landscape panel nicely
const AUTO_ROTATE_SPEED = 0.35
const RENDERER_CONFIG = { antialias: true, alpha: true, powerPreference: 'high-performance' }
const NO_RINGS = []
const NO_EVENTS = []

// ---- tiled surface imagery (Google-Earth-style progressive detail) --------------
//
// react-globe.gl's tile engine (globeTileEngineUrl) requests standard {z}/{x}/{y} slippy-map
// tiles for only the visible region, sharpening as the camera zooms in — instead of one
// globeImageUrl JPEG stretched over the whole sphere, which is what goes blurry on zoom.
//
// MAX_TILE_LEVEL is the single knob for "how much detail": raise it (max ~8) for a bit more
// sharpness, lower it (min ~6) to fetch fewer tiles on a slow connection. 7 is deliberately
// where this sits: three-globe's own tile engine (three-slippy-map-globe) switches from
// "render every tile at this level unconditionally" to frustum-culled fetching above level 6,
// and stops building a per-level spatial lookup octree above level 7 (generating tiles
// on-the-fly instead). Level 7 is the last level inside both of those fast paths — enough to
// make a zoomed-in country/region look genuinely sharper than the single stretched texture,
// without stepping into the library's slower path or ever requesting city-street-level tiles.
const MAX_TILE_LEVEL = 7

// Keyless, no-API-key tile sources only.
//   - Normal: standard OpenStreetMap tiles. (CartoDB's anonymous basemaps — including the
//     Voyager style that would otherwise be the natural pick here — now render an
//     "API KEY REQUIRED" watermark instead of a map; confirmed while building this, the same
//     issue hit earlier on the Local view's Leaflet map. OSM's own tiles are the safe fallback.)
//   - Satellite: Esri World Imagery. Esri's tile path is z/y/x, not the usual z/x/y — get the
//     order wrong and every tile lands in the wrong place.
const TILE_SUBDOMAINS = ['a', 'b', 'c']
const TILE_URL = {
  normal: (x, y, level) => `https://${TILE_SUBDOMAINS[(x + y) % TILE_SUBDOMAINS.length]}.tile.openstreetmap.org/${level}/${x}/${y}.png`,
  satellite: (x, y, level) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${level}/${y}/${x}`,
}
const TILE_ATTRIBUTION = {
  normal: '© OpenStreetMap contributors',
  satellite: 'Tiles © Esri',
}
// One low-zoom tile per mode: used to probe reachability before switching that mode over to
// tiles, and — as a happy side effect — to warm the browser's HTTP cache for that exact URL,
// so the real switch-over moments later resolves instantly instead of re-fetching from cold.
const PROBE_TILE_URL = { normal: TILE_URL.normal(0, 0, 0), satellite: TILE_URL.satellite(0, 0, 0) }
const PROBE_TIMEOUT_MS = 5000

/** Resolves true/false; never rejects. Mirrors how three.js's own TextureLoader loads an
 *  image (a plain <img>, not fetch()), so it reflects what the real tile load will do,
 *  including for cross-origin tile servers that don't send CORS headers for fetch(). */
function probeTile(url, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const img = new Image()
    const done = (ok) => {
      img.onload = null
      img.onerror = null
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => done(false), timeoutMs)
    img.onload = () => done(true)
    img.onerror = () => done(false)
    img.src = url
  })
}

// ---- event visuals: one distinct look per layer ------------------------------------
//
// Every event is a THREE.Sprite sitting flat on the surface (chosen over htmlElementsData: at
// 300+ events, live-repositioning that many DOM nodes every frame is far more expensive than
// sprites already in the WebGL scene, and a sprite's hit-area is just its scale). The LAYER
// decides the sprite's texture, opacity and size so layers read apart at a glance; SEVERITY
// decides its colour (the shared 1 slate / 2 green / 3 amber / 4 orange / 5 red palette):
//
//   alerts       brightest glow + a faint, slow ripple                     (highest trust)
//   earthquakes  crisp small glow, sized by magnitude; M4.5+ also gets a faint ripple
//   air_quality  soft, wide filled disc, breathing slowly (colour = AQI band)
//   weather      small "station" glyph: solid core inside a thin ring
//   news         small, dim diamond (weakest signal, deliberately recessive)
//   anomaly      bold outlined ring: reads as "something unusual here"
//   climate      small outlined square (daily, not live)
//   simulated    plain soft dot, as before
//
// RINGS are deliberately subtle: faint, slow, small, and only for official alerts and M4.5+
// earthquakes (one per spot, capped at MAX_RINGS = 30). Their radius is scaled by the camera
// altitude so a ripple stays the same small size on screen instead of flooding the view when
// zoomed in. prefers-reduced-motion: no rings, no breathing, no auto-rotate, instant camera moves.
const DOT_ALTITUDE = 0.0025 // just off the surface, avoids z-fighting with the globe/tile mesh
const SELECTED_SCALE_MULT = 1.35
const SELECTED_COLOR = '#ffcf70' // a warm highlight, not pure white — avoids a blown-out "sun"
const BREATHE_AQ = { amount: 0.3, periodMs: 5200 }
const BREATHE_SELECTED = { min: 0.6, max: 1, periodMs: 1100 }

const pointAltitude = (e) => 0.006 + (Math.min(e.severity, 5) - 1) * 0.014
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const magnitudeOf = (e) => (typeof e.raw?.magnitude === 'number' ? e.raw.magnitude : null)

/** Sprite look for one event (or cluster). Pure; drives the material cache below. */
function lookOf(d) {
  if (d.isCluster) return { tex: 'cluster', color: colorOf(d.severity), opacity: 0.62, scale: 3.2 + Math.log2(d.count) * 1.35 }
  const color = colorOf(d.severity)
  switch (layerOf(d)) {
    case 'alerts': return { tex: 'glow', color, opacity: 0.9, scale: d.severity >= 5 ? 4 : 3.4 }
    case 'earthquakes': {
      const mag = magnitudeOf(d)
      return { tex: 'glow', color, opacity: 0.8, scale: mag === null ? 1.4 : clamp(1 + mag * 0.45, 1.2, 4.2) }
    }
    case 'air_quality': return { tex: 'disc', color, opacity: 0.42, scale: 3.4 + d.severity * 0.5, breathe: true }
    case 'weather': return { tex: 'glyph', color, opacity: 0.95, scale: 1.9 }
    case 'news': return { tex: 'diamond', color, opacity: 0.38, scale: 1.4 }
    case 'anomaly': return { tex: 'outline', color, opacity: 1, scale: 3.4 }
    case 'climate': return { tex: 'square', color, opacity: 0.75, scale: 1.8 }
    default: return { tex: 'glow', color, opacity: 0.55, scale: 1.4 + d.severity * 0.3 }
  }
}

// ---- rings ---------------------------------------------------------------------------

// ringColor may return a function of t (0 = centre, 1 = edge). `sharpness` < 1 keeps the ring
// bright for most of its travel and then drops it off quickly: a crisp ripple, not a haze.
const fadeCache = new Map()
function fade(hex, boost = 1, sharpness = 0.8) {
  const key = `${hex}|${boost}|${sharpness}`
  if (!fadeCache.has(key)) {
    const n = parseInt(hex.slice(1), 16)
    const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
    fadeCache.set(key, (t) => `rgba(${rgb},${Math.min(1, Math.max(0, 1 - t) ** sharpness * boost)})`)
  }
  return fadeCache.get(key)
}

/** Ring spec for an event, or null when it gets no ring. `priority`: lower = kept first under the cap.
 *  `max` is in degrees of arc at the home camera altitude; the accessors scale it with zoom. */
function ringSpecOf(d) {
  const layer = layerOf(d)
  const color = colorOf(d.severity)
  if (layer === 'alerts') {
    return { priority: 0, max: 2.4, speed: 0.8, period: 3200, color: fade(color, 0.5, 1.4), boostColor: fade(color, 0.8, 1.4) }
  }
  if (layer === 'earthquakes') {
    const mag = magnitudeOf(d)
    if (mag === null || mag < 4.5) return null
    return {
      priority: 1 + (10 - mag) / 100, // bigger quakes first
      max: clamp(mag * 0.3, 1.4, 2.2), // never bigger than an official alert
      speed: 0.6,
      period: 3800,
      color: fade(color, 0.4, 1.4),
      boostColor: fade(color, 0.7, 1.4),
    }
  }
  return null
}

// Keep a ripple the same size on screen at any zoom: radius (and speed, so the pulse keeps its
// duration) scale with camera altitude relative to the home view.
const ringZoomScale = (altitude) => clamp(altitude / HOME_ALTITUDE, 0.08, 1.2)

function polarToVector3(lat, lng, radius) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((90 - lng) * Math.PI) / 180
  return new THREE.Vector3(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta))
}

// ---- textures: white shapes drawn once on a canvas, tinted per material ------------------

function canvasTexture(draw, size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d'), size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function radial(ctx, size, stops) {
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [at, alpha] of stops) g.addColorStop(at, `rgba(255,255,255,${alpha})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
}

function createTextures() {
  const c = 64 // centre of a 128px canvas
  return {
    // soft multi-stop glow (the original look)
    glow: canvasTexture((ctx, s) => radial(ctx, s, [[0, 0.95], [0.18, 0.75], [0.45, 0.32], [0.75, 0.08], [1, 0]])),
    // filled disc with a soft edge: reads as an AREA reading, not a point
    disc: canvasTexture((ctx, s) => radial(ctx, s, [[0, 0.75], [0.5, 0.6], [0.72, 0.3], [0.9, 0.08], [1, 0]])),
    // crowded-area cluster: glow with a defined rim
    cluster: canvasTexture((ctx, s) => {
      radial(ctx, s, [[0, 0.85], [0.35, 0.55], [0.7, 0.2], [1, 0]])
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.arc(c, c, 44, 0, Math.PI * 2); ctx.stroke()
    }),
    // weather-station glyph: solid core + thin ring + faint halo
    glyph: canvasTexture((ctx, s) => {
      radial(ctx, s, [[0, 0.35], [0.6, 0.12], [1, 0]])
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(c, c, 16, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 6
      ctx.beginPath(); ctx.arc(c, c, 34, 0, Math.PI * 2); ctx.stroke()
    }),
    // anomaly: bold hollow ring + small centre dot
    outline: canvasTexture((ctx) => {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 12
      ctx.beginPath(); ctx.arc(c, c, 46, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(c, c, 9, 0, Math.PI * 2); ctx.fill()
    }),
    // news: small soft diamond
    diamond: canvasTexture((ctx) => {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath(); ctx.moveTo(c, 18); ctx.lineTo(110, c); ctx.lineTo(c, 110); ctx.lineTo(18, c); ctx.closePath(); ctx.fill()
    }),
    // climate: outlined square
    square: canvasTexture((ctx) => {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 12
      ctx.strokeRect(24, 24, 80, 80)
    }),
  }
}

/**
 * Lazily-created shared SpriteMaterials, one per (texture, colour, opacity): a few dozen at
 * most, however many events there are. react-globe.gl disposes an object's material when it
 * removes the object; three.js transparently re-uploads a disposed-but-still-used material,
 * so sharing stays safe.
 *
 * Normal (not additive) blending on purpose: additive pushes overlaps toward white regardless
 * of tint (the "blown-out sun" look); plain alpha keeps each tier's real colour.
 */
function createMaterialCache() {
  const textures = createTextures()
  const cache = new Map()
  return {
    get(look, selected) {
      const color = selected ? SELECTED_COLOR : look.color
      const opacity = selected ? BREATHE_SELECTED.max : look.opacity
      const key = `${look.tex}|${color}|${opacity}`
      let mat = cache.get(key)
      if (!mat) {
        mat = new THREE.SpriteMaterial({
          map: textures[look.tex], color, opacity, transparent: true, depthWrite: false, blending: THREE.NormalBlending, sizeAttenuation: true,
        })
        mat.userData = { baseOpacity: opacity, breathe: Boolean(look.breathe) && !selected, selected }
        cache.set(key, mat)
      }
      return mat
    },
    all: () => cache.values(),
  }
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])

// Event titles come from third-party feeds, and the globe tooltip is rendered as HTML: always escape.
function pointLabel(e) {
  if (e.isCluster) {
    const parts = Object.entries(e.byLayer).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${n} ${esc(LAYER_BY_ID[id]?.label ?? id)}`)
    return (
      `<div class="gv-tip">` +
      `<div class="gv-tip-title">${e.count} events in this area</div>` +
      `<div class="gv-tip-meta"><span>${parts.join(' · ')}</span></div>` +
      `<div class="gv-tip-meta"><span>Click to zoom in</span></div>` +
      `</div>`
    )
  }
  const time = formatAgo(e.timestamp)
  const badge = TAGS[tagOf(e)].badge
  return (
    `<div class="gv-tip">` +
    `<div class="gv-tip-title">${esc(e.title)}</div>` +
    `<div class="gv-tip-meta">` +
    `<i class="gv-tip-dot" style="background:${colorOf(e.severity)}"></i>` +
    `<span>${esc(LAYER_BY_ID[layerOf(e)]?.label)} · ${esc(e.source)}</span>` +
    `<span>${esc(nameOf(e.severity))} (${e.severity})${time ? ` · ${esc(time)}` : ''}</span>` +
    (badge ? `<b class="gv-tip-tag" data-tag="${esc(tagOf(e))}">${esc(badge)}</b>` : '') +
    `</div></div>`
  )
}

// ---- data shaping (rendering-performance concerns specific to the globe) --------

const sameEvent = (a, b) =>
  a.timestamp === b.timestamp && a.severity === b.severity && a.title === b.title && a.lat === b.lat && a.lng === b.lng &&
  a.isSimulated === b.isSimulated && a.layer === b.layer && a.tag === b.tag

/**
 * Keep the previous object for every event that did not change. The globe binds one mesh to each
 * data object, so reusing objects means a poll only adds / removes the meshes that really changed.
 * `events` is already validated by the shared useEvents hook.
 */
function mergeEvents(previous, events) {
  const before = new Map(previous.map((e) => [e.id, e]))
  const seen = new Set()
  const next = []
  for (const event of events) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    const old = before.get(event.id)
    next.push(old && sameEvent(old, event) ? old : event)
  }
  const unchanged = next.length === previous.length && next.every((e, i) => e === previous[i])
  return unchanged ? previous : next
}

/** Most severe first, then newest; capped so the scene stays light. */
function pickPoints(events) {
  return [...events]
    .sort((a, b) => b.severity - a.severity || Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, MAX_POINTS)
}

// ---- density: zoom-aware grid clustering -----------------------------------------------
//
// With 300+ events a zoomed-out globe turns to soup. Events are bucketed into a lat/lng grid
// whose cell size follows the camera altitude; a cell holding CLUSTER_MIN+ events collapses
// into one "crowded area" glow (sized by count, coloured by its worst severity, with a count
// label). Zooming in shrinks the cells until, below altitude 0.7, every event is individual.
// Official alerts, M>=4.5 earthquakes and severity-5 events are never swallowed by a cluster.
const CLUSTER_MIN = 4
function clusterCellDeg(altitude) {
  if (altitude >= 1.9) return 7
  if (altitude >= 1.2) return 4
  if (altitude >= 0.7) return 2
  return 0
}
const neverClustered = (e) => layerOf(e) === 'alerts' || (magnitudeOf(e) ?? 0) >= 4.5 || (e.severity >= 5 && layerOf(e) !== 'news')

function clusterEvents(events, cellDeg, previous) {
  if (!cellDeg) return events
  const cells = new Map()
  const out = []
  for (const e of events) {
    if (neverClustered(e)) { out.push(e); continue }
    const latCell = Math.floor((e.lat + 90) / cellDeg)
    const midLat = latCell * cellDeg - 90 + cellDeg / 2
    const lngSize = Math.min(360, cellDeg / Math.max(0.2, Math.cos((midLat * Math.PI) / 180)))
    const key = `${latCell}:${Math.floor((e.lng + 180) / lngSize)}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(e)
  }
  for (const [key, members] of cells) {
    if (members.length < CLUSTER_MIN) { out.push(...members); continue }
    let lat = 0, x = 0, y = 0, severity = 1
    const byLayer = {}
    for (const m of members) {
      lat += m.lat
      x += Math.cos((m.lng * Math.PI) / 180)
      y += Math.sin((m.lng * Math.PI) / 180)
      if (layerOf(m) !== 'news') severity = Math.max(severity, m.severity) // media never sets a cluster's colour
      byLayer[layerOf(m)] = (byLayer[layerOf(m)] ?? 0) + 1
    }
    const id = `cluster:${cellDeg}:${key}`
    const old = previous.get(id)
    const cluster = old && old.count === members.length && old.severity === severity
      ? old // same cluster as last time: reuse the object so its mesh is kept
      : { id, isCluster: true, count: members.length, severity, byLayer, lat: lat / members.length, lng: (Math.atan2(y, x) * 180) / Math.PI }
    out.push(cluster)
  }
  return out
}

/** The event exactly as the backend sent it (react-globe.gl attaches its own bookkeeping
 *  fields onto each point object; strip back to the event contract before handing it out). */
const toEvent = ({ id, type, title, lat, lng, timestamp, severity, source, isSimulated, raw, layer, tag, sourceUrl }) => ({
  id, type, title, lat, lng, timestamp, severity, source, isSimulated, raw, layer, tag, sourceUrl,
})

// ---- small hooks ----------------------------------------------------------

/** Track an element's size (throttled to one update per frame). */
function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let frame = 0
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const { width, height } = entry.contentRect
        setSize((s) => (s.width === Math.round(width) && s.height === Math.round(height) ? s : { width: Math.round(width), height: Math.round(height) }))
      })
    })
    observer.observe(el)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [ref])
  return size
}

function readStoredMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY)
    return stored in MODES ? stored : 'normal'
  } catch {
    return 'normal'
  }
}

// Probe for WebGL, then hand the probe context straight back (browsers cap live contexts).
const hasWebGL = () => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return Boolean(gl)
  } catch {
    return false
  }
}

// ---- error boundary: a broken globe must never take the whole page down ---------

class GlobeBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('[GlobeView] globe failed to render:', error) }
  render() {
    return this.state.failed ? <Unavailable /> : this.props.children
  }
}

const Unavailable = () => (
  <div className="gv-unavailable" role="alert">
    The 3D globe needs WebGL, which is not available in this browser.
  </div>
)

// ---- component -------------------------------------------------------------

export default function GlobeView({ onSelectEvent, theme, active = true, events: incoming = NO_EVENTS, totalCount, loading = false, error = null, lastUpdated = null, focus = null }) {
  const { dark } = useTheme()
  const resolvedTheme = theme || (dark ? 'dark' : 'light')
  const reduced = useReducedMotion()

  const rootRef = useRef(null)
  const globeRef = useRef(null)
  const size = useElementSize(rootRef)
  const sizeRef = useRef(size)
  useEffect(() => { sizeRef.current = size }, [size])
  const [mode, setMode] = useState(readStoredMode)
  const [webgl] = useState(hasWebGL)
  const [selectedId, setSelectedId] = useState(null)
  const [cellDeg, setCellDeg] = useState(clusterCellDeg(HOME_ALTITUDE))

  // Data comes from GlobalView (already validated + layer-filtered); GlobeView's own
  // identity-preserving merge (see mergeEvents above) means a poll or a layer toggle only
  // touches the meshes that actually changed.
  const [events, setEvents] = useState([])
  useEffect(() => setEvents((previous) => mergeEvents(previous, incoming)), [incoming])
  const status = error ? 'offline' : loading ? 'loading' : 'live'

  const points = useMemo(() => pickPoints(events), [events])
  const clusterCache = useRef(new Map())
  const items = useMemo(() => {
    const next = clusterEvents(points, cellDeg, clusterCache.current)
    clusterCache.current = new Map(next.filter((d) => d.isCluster).map((d) => [d.id, d]))
    return next
  }, [points, cellDeg])
  const clusters = useMemo(() => items.filter((d) => d.isCluster), [items])

  // Ring datum objects are cached per event object so an unchanged event keeps its ring
  // (and its pulse phase) across polls.
  const ringCache = useRef(new WeakMap())
  const rings = useMemo(() => {
    if (reduced) return NO_RINGS
    const candidates = []
    for (const d of items) {
      if (d.isCluster) continue
      let ring = ringCache.current.get(d)
      if (ring === undefined) {
        const spec = ringSpecOf(d)
        ring = spec ? { id: d.id, lat: d.lat, lng: d.lng, severity: d.severity, spec } : null
        ringCache.current.set(d, ring)
      }
      if (ring) candidates.push(ring)
    }
    // One ring per spot: several alerts at one state centroid would otherwise stack into a blob.
    const taken = new Set()
    return candidates
      .sort((a, b) => a.spec.priority - b.spec.priority || b.severity - a.severity)
      .filter((r) => { const k = `${r.lat.toFixed(1)},${r.lng.toFixed(1)}`; if (taken.has(k)) return false; taken.add(k); return true })
      .slice(0, MAX_RINGS)
  }, [items, reduced])

  // customThreeObjectUpdate reads selection from a ref, but react-globe.gl only re-digests a
  // layer when customLayerData's own reference changes — this shallow copy forces that re-digest
  // on selection so the highlight repaints immediately.
  const customLayerData = useMemo(() => [...items], [items, selectedId])

  // latest props without re-creating the globe callbacks
  const onSelectRef = useRef(onSelectEvent)
  useEffect(() => { onSelectRef.current = onSelectEvent }, [onSelectEvent])
  const reducedRef = useRef(reduced)
  useEffect(() => { reducedRef.current = reduced }, [reduced])
  const selectedIdRef = useRef(selectedId)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  // ---- sprites: shared materials, created lazily once per mount ------------------
  const materials = useMemo(createMaterialCache, [])

  const customThreeObject = useCallback((d) => new THREE.Sprite(materials.get(lookOf(d), false)), [materials])
  const customThreeObjectUpdate = useCallback(
    (sprite, d, globeRadius) => {
      sprite.position.copy(polarToVector3(d.lat, d.lng, globeRadius * (1 + DOT_ALTITUDE)))
      const isSelected = !d.isCluster && d.id === selectedIdRef.current
      const look = lookOf(d)
      sprite.material = materials.get(look, isSelected)
      sprite.scale.setScalar(look.scale * (isSelected ? SELECTED_SCALE_MULT : 1))
    },
    [materials],
  )

  // ---- ring styling: boost the selected event's ring, if it has one -------------
  const isSel = (r) => r.id === selectedIdRef.current
  const zoomRef = useRef(1)
  const ringColor = useCallback((r) => (isSel(r) ? r.spec.boostColor : r.spec.color), [])
  const ringMaxRadius = useCallback((r) => r.spec.max * zoomRef.current * (isSel(r) ? 1.3 : 1), [])
  const ringPropagationSpeed = useCallback((r) => r.spec.speed * zoomRef.current * (isSel(r) ? 1.3 : 1), [])
  const ringRepeatPeriod = useCallback((r) => r.spec.period * (isSel(r) ? 0.8 : 1), [])
  // (ring accessors are `triggerUpdate: false` in three-globe and are read fresh at the moment
  // each pulse starts, so their selectedIdRef read takes effect with no extra digest.)

  // ---- cluster count labels (only clusters: a few dozen DOM nodes at most) ---------
  const htmlElement = useCallback((d) => {
    const el = document.createElement('div')
    el.className = 'gv-cluster-count'
    el.textContent = d.count > 999 ? '999+' : String(d.count)
    return el
  }, [])
  const htmlVisibility = useCallback((el, visible) => { el.style.opacity = visible ? '1' : '0' }, [])

  // ---- breathing: AQ discs swell gently; the selected marker pulses ----------------
  useEffect(() => {
    if (reduced || !active) return undefined
    let raf = 0
    const start = performance.now()
    const tick = (now) => {
      const t = now - start
      const aqPhase = (Math.sin((t / BREATHE_AQ.periodMs) * 2 * Math.PI) + 1) / 2
      const selPhase = (Math.sin((t / BREATHE_SELECTED.periodMs) * 2 * Math.PI) + 1) / 2
      for (const mat of materials.all()) {
        const { baseOpacity, breathe, selected } = mat.userData
        if (breathe) mat.opacity = baseOpacity * (1 - BREATHE_AQ.amount + BREATHE_AQ.amount * aqPhase)
        else if (selected) mat.opacity = BREATHE_SELECTED.min + (BREATHE_SELECTED.max - BREATHE_SELECTED.min) * selPhase
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [materials, reduced, active])

  // ---- tiled imagery: probe once per mode, then switch that mode over to tiles ---
  const [tileAvailable, setTileAvailable] = useState({ normal: null, satellite: null })
  const probedModesRef = useRef(new Set())
  useEffect(() => {
    if (probedModesRef.current.has(mode)) return
    probedModesRef.current.add(mode)
    probeTile(PROBE_TILE_URL[mode]).then((ok) => {
      if (!ok) console.warn(`[GlobeView] tile imagery unreachable for "${mode}" mode — staying on the static texture.`)
      setTileAvailable((prev) => ({ ...prev, [mode]: ok }))
    })
  }, [mode])
  const useTiles = tileAvailable[mode] === true
  const firstModeRender = useRef(true)
  useEffect(() => {
    if (firstModeRender.current) { firstModeRender.current = false; return }
    globeRef.current?.globeTileEngineClearCache?.() // the previous mode's tiles are no longer relevant
  }, [mode])

  // ---- auto-rotate: spins once on load, stops for good the moment the user touches the globe --
  const threeRef = useRef(null) // what we need to free on unmount
  const detachControls = useRef(() => {})

  const handleReady = useCallback(() => {
    const globe = globeRef.current
    if (!globe) return
    const controls = globe.controls()
    const renderer = globe.renderer()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

    controls.autoRotate = !reducedRef.current
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED
    controls.enablePan = false
    // Don't let the user zoom in past the point the capped tile level still looks acceptable —
    // beyond it the tiles just get magnified (blurry again) rather than sharper.
    const tileFloorAltitude = 8 / 2 ** MAX_TILE_LEVEL // matches three-slippy-map-globe's own level thresholds
    controls.minDistance = globe.getGlobeRadius() * (1 + tileFloorAltitude)
    controls.maxDistance = 450

    // Dragging/zooming stops the initial spin permanently — it never resumes on its own.
    const onStart = () => { controls.autoRotate = false }
    controls.addEventListener('start', onStart)
    detachControls.current = () => controls.removeEventListener('start', onStart)

    // portrait panels are narrower than tall: pull the camera back so the globe is not cropped
    const { width, height } = sizeRef.current
    const aspect = width && height ? width / height : 1
    const altitude = aspect >= 1 ? HOME_ALTITUDE : HOME_ALTITUDE / aspect ** 0.85
    globe.pointOfView({ ...HOME_VIEW, altitude }, 0)
    setCellDeg(clusterCellDeg(altitude))
    zoomRef.current = ringZoomScale(altitude)
    threeRef.current = { renderer }
    if (!active) globe.pauseAnimation?.() // AppShell may mount this while the Local view is showing
  }, [active])

  // Re-cluster only when the zoom crosses a level boundary (onZoom fires every frame).
  const handleZoom = useCallback(({ altitude }) => {
    if (!Number.isFinite(altitude)) return
    setCellDeg(clusterCellDeg(altitude))
    zoomRef.current = ringZoomScale(altitude) // read by the ring accessors at each new pulse
  }, [])

  // reduced-motion can change while the page is open
  useEffect(() => {
    const controls = globeRef.current?.controls()
    if (controls && reduced) controls.autoRotate = false
  }, [reduced])

  // AppShell keeps GlobeView mounted-but-hidden while the Local view is active (re-initialising
  // three.js is expensive); pause/resume its render loop rather than unmounting.
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !threeRef.current) return
    if (active) globe.resumeAnimation?.()
    else globe.pauseAnimation?.()
  }, [active])

  const flyTo = useCallback((lat, lng, altitude) => {
    const globe = globeRef.current
    if (!globe) return
    globe.controls().autoRotate = false // any camera move by the user stops the spin for good
    globe.pointOfView({ lat, lng, altitude }, reducedRef.current ? 0 : 900)
  }, [])

  const handleCustomLayerClick = useCallback((d) => {
    const globe = globeRef.current
    if (!globe) return
    const { altitude } = globe.pointOfView()
    if (d.isCluster) {
      // A crowded area expands as the camera moves in.
      flyTo(d.lat, d.lng, Math.max(0.45, altitude * 0.5))
      return
    }
    flyTo(d.lat, d.lng, Math.min(altitude, 1.6))
    setSelectedId(d.id)
    onSelectRef.current?.(toEvent(d))
  }, [flyTo])

  // An event picked elsewhere (the ticker): fly low enough that it is not inside a cluster.
  useEffect(() => {
    if (!focus?.event) return
    flyTo(focus.event.lat, focus.event.lng, 0.6)
    setSelectedId(focus.event.id)
  }, [focus, flyTo])

  const handleGlobeClick = useCallback(() => {
    const controls = globeRef.current?.controls()
    if (controls) controls.autoRotate = false // background click counts too, no resume
    setSelectedId(null)
  }, [])

  // ---- persist + prefetch --------------------------------------------------------
  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode) } catch { /* private mode: fine */ }
  }, [mode])

  useEffect(() => {
    // warm the other texture so the toggle feels instant
    const warm = () => Object.values(MODES).forEach((m) => { new Image().src = m.globeImageUrl })
    const id = window.requestIdleCallback ? window.requestIdleCallback(warm) : setTimeout(warm, 1500)
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id))
  }, [])

  // ---- teardown ------------------------------------------------------------------
  // react-globe.gl empties the scene and disposes geometries / materials / maps on unmount
  // (including the sprites' shared materials and their textures). We also release the
  // WebGL context so its GPU memory is freed right away instead of waiting for GC. The
  // mounted flag keeps React StrictMode's throw-away mount/unmount cycle from destroying a
  // live globe.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      detachControls.current()
      const three = threeRef.current
      setTimeout(() => {
        if (mounted.current || !three) return
        three.renderer.dispose()
        three.renderer.forceContextLoss()
        threeRef.current = null
      }, 0)
    }
  }, [])

  const modeConfig = MODES[mode]
  const atmosphere = ATMOSPHERE[mode]
  const ready = size.width > 0 && size.height > 0
  const shown = events.length
  const hidden = Number.isFinite(totalCount) ? totalCount - shown : 0

  return (
    <div ref={rootRef} className="gv-root" data-theme={resolvedTheme} data-mode={mode} inert={!active}>
      {webgl ? (
        <GlobeBoundary>
          {ready && (
            <Globe
              ref={globeRef}
              width={size.width}
              height={size.height}
              rendererConfig={RENDERER_CONFIG}
              animateIn={!reduced}
              backgroundColor="rgba(0,0,0,0)"
              globeImageUrl={modeConfig.globeImageUrl}
              bumpImageUrl={modeConfig.bumpImageUrl}
              globeTileEngineUrl={useTiles ? TILE_URL[mode] : null}
              globeTileEngineMaxLevel={MAX_TILE_LEVEL}
              showAtmosphere
              atmosphereColor={atmosphere[resolvedTheme]}
              atmosphereAltitude={atmosphere.altitude}
              onGlobeReady={handleReady}
              onGlobeClick={handleGlobeClick}
              onZoom={handleZoom}
              customLayerData={customLayerData}
              customThreeObject={customThreeObject}
              customThreeObjectUpdate={customThreeObjectUpdate}
              customLayerLabel={pointLabel}
              onCustomLayerClick={handleCustomLayerClick}
              ringsData={rings}
              ringLat="lat"
              ringLng="lng"
              ringAltitude={pointAltitude}
              ringColor={ringColor}
              ringMaxRadius={ringMaxRadius}
              ringPropagationSpeed={ringPropagationSpeed}
              ringRepeatPeriod={ringRepeatPeriod}
              htmlElementsData={clusters}
              htmlLat="lat"
              htmlLng="lng"
              htmlAltitude={0.012}
              htmlElement={htmlElement}
              htmlElementVisibilityModifier={htmlVisibility}
              htmlTransitionDuration={0}
            />
          )}
        </GlobeBoundary>
      ) : (
        <Unavailable />
      )}

      <div className="gv-toggle" role="group" aria-label="Globe style">
        {Object.entries(MODES).map(([key, { label, Icon }]) => (
          <button key={key} type="button" className={key === mode ? 'is-active' : undefined} aria-pressed={key === mode} onClick={() => setMode(key)}>
            <Icon aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {useTiles && <p className="gv-tile-credit">{TILE_ATTRIBUTION[mode]}</p>}

      <p className="gv-status" data-status={status} aria-live="polite">
        <i aria-hidden="true" />
        {status === 'live' && `${shown} events${hidden > 0 ? ` (${hidden} on hidden layers)` : ''}${clusters.length ? ` · ${clusters.length} crowded areas` : ''}${lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}`}
        {status === 'loading' && 'Loading events…'}
        {status === 'offline' && `Can't reach the events API, retrying${events.length ? ' (showing last data)' : ''}`}
      </p>
    </div>
  )
}
