import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import * as THREE from 'three'
import { Map as MapIcon, Satellite } from 'lucide-react'
import { colorOf, nameOf } from '../lib/severity.js'
import { formatAgo } from '../lib/time.js'
import { useReducedMotion } from '../lib/useReducedMotion.js'
import { useTheme } from './useTheme.js'
import { useEvents } from './useEvents.js'
import './GlobeView.css'

/**
 * GlobeView: the GLOBAL view's 3D globe.
 *
 *   <GlobeView onSelectEvent={(event) => ...} theme="light" | "dark" active />
 *
 * Props (all optional)
 *   onSelectEvent(event)  called with the clicked event, exactly the backend shape
 *                         { id, type, title, lat, lng, timestamp, severity, source, isSimulated, raw }
 *   theme                 "light" | "dark"; defaults to the app theme (<html class="dark">)
 *   active                default true. When false, the render loop is paused (AppShell keeps
 *                         this component mounted-but-hidden while the Local view is shown,
 *                         since re-initialising the globe is expensive) — data still polls.
 *   pollMs                refresh interval for GET {API_BASE}/events?scope=global, default 45 000
 *
 * It fills its parent (position: relative; width/height: 100%), so give the parent a size.
 */

// ---- config ---------------------------------------------------------------

const MAX_POINTS = 500 // three.js cost grows with meshes; keep the most severe / newest
const MAX_RINGS = 80 // only severity >= 3 is eligible for a ring at all; see RING_MIN_SEVERITY below

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

// ---- event visuals: ripple rings + glowing dots (no pillars) --------------------
//
// Every event gets a small glowing dot sitting flat on the surface (a THREE.Sprite with a
// shared radial-gradient texture, tinted per severity — chosen over htmlElementsData: at
// 250+ events, live-repositioning that many real DOM nodes every frame is noticeably more
// expensive than moving sprites already living in the WebGL scene, and a sprite's hit-area is
// just its scale, so it doubles as a generous, easy-to-click hit target with no extra mesh).
//
// Severity 3 and up also gets an expanding "radar ping" ring (ringsData). Rings are cheap per
// object but not free — three-globe allocates a fresh mesh for every single pulse — so with
// 250+ events only genuinely significant ones (>=3) are eligible, capped further to
// MAX_RINGS. Severity 1-2 stay as a slow, subtle breathing glow on the dot alone; that's the
// "cap the animated ring layer" trade-off the brief for a smooth frame rate.
const RING_MIN_SEVERITY = 3
const DOT_ALTITUDE = 0.0025 // just off the surface, avoids z-fighting with the globe/tile mesh
const DOT_SCALE = { 1: 1.4, 2: 1.7, 3: 2.1, 4: 2.5, 5: 3 } // sprite scale in world units (radius=100)
const SELECTED_SCALE_MULT = 1.35
const SELECTED_COLOR = '#ffcf70' // a warm highlight, not pure white — avoids a blown-out "sun"
const BREATHE = {
  1: { min: 0.22, max: 0.42, periodMs: 4600 },
  2: { min: 0.28, max: 0.5, periodMs: 3300 },
  selected: { min: 0.5, max: 0.75, periodMs: 1100 },
}

const pointAltitude = (e) => 0.006 + (e.severity - 1) * 0.014

// ringColor may return a function of t (0 = centre, 1 = edge): fade out as the ring grows.
const fade = (hex, boost = 1) => {
  const n = parseInt(hex.slice(1), 16)
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
  return (t) => `rgba(${rgb},${Math.min(1, Math.max(0, 1 - t) ** 0.8 * boost)})`
}
const RING_FADE = { 3: fade(colorOf(3)), 4: fade(colorOf(4)), 5: fade(colorOf(5)) }
const RING_FADE_SELECTED = { 3: fade(colorOf(3), 1.3), 4: fade(colorOf(4), 1.3), 5: fade(colorOf(5), 1.3) }
const RING_MAX_RADIUS = { 3: 5.5, 4: 7.5, 5: 10 } // degrees of arc
const RING_SPEED = { 3: 1.2, 4: 2, 5: 3 } // degrees/sec — higher severity pulses faster
const RING_PERIOD = { 3: 2200, 4: 1500, 5: 900 } // ms between pulses — shorter = more urgent

function polarToVector3(lat, lng, radius) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((90 - lng) * Math.PI) / 180
  return new THREE.Vector3(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta))
}

/** One shared canvas-based radial-gradient texture (white, alpha falls off outward, in a soft
 *  multi-stop curve rather than a hard disc); each severity tier tints it via material.color
 *  rather than needing its own texture. */
function createGlowTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.75)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.32)')
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.08)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

/** The 6 shared sprite materials (severity 1-5 + a brighter "selected" override) and the one
 *  glow texture they all reuse. Disposed automatically: react-globe.gl walks every object it
 *  removes (via customLayerData([])) and disposes material + material.map generically.
 *
 *  Normal (not additive) blending on purpose: additive blending pushes any overlap toward
 *  white regardless of tint, which is what made these look like a blown-out sun sitting on
 *  the map. Plain alpha blending keeps each tier's actual colour and lets the map/tiles show
 *  through everywhere the glow isn't at its hottest, more like a soft, translucent heat zone. */
function createGlowMaterials() {
  const glowTexture = createGlowTexture()
  const common = { map: glowTexture, transparent: true, depthWrite: false, blending: THREE.NormalBlending, sizeAttenuation: true }
  const bySeverity = {}
  for (let severity = 1; severity <= 5; severity += 1) {
    bySeverity[severity] = new THREE.SpriteMaterial({ ...common, color: colorOf(severity), opacity: severity >= 3 ? 0.42 + severity * 0.03 : BREATHE[severity].min })
  }
  const selected = new THREE.SpriteMaterial({ ...common, color: SELECTED_COLOR, opacity: BREATHE.selected.min })
  return { glowTexture, bySeverity, selected }
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])

// Event titles come from third-party feeds, and the globe tooltip is rendered as HTML: always escape.
function pointLabel(e) {
  const time = formatAgo(e.timestamp)
  return (
    `<div class="gv-tip">` +
    `<div class="gv-tip-title">${esc(e.title)}</div>` +
    `<div class="gv-tip-meta">` +
    `<i class="gv-tip-dot" style="background:${colorOf(e.severity)}"></i>` +
    `<span>${esc(e.source)}</span>` +
    `<span>${esc(nameOf(e.severity))} (${e.severity})${time ? ` · ${esc(time)}` : ''}</span>` +
    (e.isSimulated ? `<b class="gv-tip-tag">SIMULATED</b>` : '') +
    `</div></div>`
  )
}

// ---- data shaping (rendering-performance concerns specific to the globe) --------

const sameEvent = (a, b) =>
  a.timestamp === b.timestamp && a.severity === b.severity && a.title === b.title && a.lat === b.lat && a.lng === b.lng && a.isSimulated === b.isSimulated

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

/** The event exactly as the backend sent it (react-globe.gl attaches its own bookkeeping
 *  fields onto each point object; strip back to the 10-key contract before handing it out). */
const toEvent = ({ id, type, title, lat, lng, timestamp, severity, source, isSimulated, raw }) => ({
  id, type, title, lat, lng, timestamp, severity, source, isSimulated, raw,
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

export default function GlobeView({ onSelectEvent, theme, active = true, pollMs }) {
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

  // Shared fetch/poll/validate; on top of that, GlobeView's own identity-preserving merge
  // (see mergeEvents above) so a poll only touches the meshes that actually changed.
  const { events: fetchedEvents, loading, error, lastUpdated } = useEvents({ scope: 'global', pollMs })
  const [events, setEvents] = useState([])
  useEffect(() => setEvents((previous) => mergeEvents(previous, fetchedEvents)), [fetchedEvents])
  const status = error ? 'offline' : loading ? 'loading' : 'live'

  const points = useMemo(() => pickPoints(events), [events])
  const rings = useMemo(
    () => (reduced ? NO_RINGS : points.filter((e) => e.severity >= RING_MIN_SEVERITY).slice(0, MAX_RINGS)),
    [points, reduced],
  )
  // customThreeObjectUpdate and customLayerData are read fresh from a ref inside the closure
  // (see below), but react-globe.gl only re-digests a layer (re-invoking that closure for
  // every existing sprite) when customLayerData's own reference changes — selecting a point
  // doesn't otherwise touch `points`, so this shallow copy exists purely to force that
  // re-digest and get the "selected" highlight to actually repaint immediately.
  const customLayerData = useMemo(() => [...points], [points, selectedId])

  // latest props without re-creating the globe callbacks
  const onSelectRef = useRef(onSelectEvent)
  useEffect(() => { onSelectRef.current = onSelectEvent }, [onSelectEvent])
  const reducedRef = useRef(reduced)
  useEffect(() => { reducedRef.current = reduced }, [reduced])
  const selectedIdRef = useRef(selectedId)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  // ---- glow dots: sprites + shared materials, created once per mount ------------
  const glow = useMemo(createGlowMaterials, [])

  const customThreeObject = useCallback(() => new THREE.Sprite(glow.bySeverity[1]), [glow])
  const customThreeObjectUpdate = useCallback(
    (sprite, d, globeRadius) => {
      sprite.position.copy(polarToVector3(d.lat, d.lng, globeRadius * (1 + DOT_ALTITUDE)))
      const isSelected = d.id === selectedIdRef.current
      sprite.material = isSelected ? glow.selected : glow.bySeverity[d.severity]
      sprite.scale.setScalar(DOT_SCALE[d.severity] * (isSelected ? SELECTED_SCALE_MULT : 1))
    },
    [glow],
  )

  // ---- ring styling: boost the selected event's ring, if it has one -------------
  const ringColor = useCallback((e) => (e.id === selectedIdRef.current ? RING_FADE_SELECTED : RING_FADE)[e.severity], [])
  const ringMaxRadius = useCallback((e) => RING_MAX_RADIUS[e.severity] * (e.id === selectedIdRef.current ? 1.25 : 1), [])
  const ringPropagationSpeed = useCallback((e) => RING_SPEED[e.severity] * (e.id === selectedIdRef.current ? 1.2 : 1), [])
  const ringRepeatPeriod = useCallback((e) => (e.id === selectedIdRef.current ? RING_PERIOD[e.severity] * 0.7 : RING_PERIOD[e.severity]), [])
  // (ringColor/ringMaxRadius/etc. are all `triggerUpdate: false` in three-globe and are read
  // fresh from state at the moment each pulse starts, not through a react-driven digest — so,
  // unlike the dots above, no extra trick is needed for their selectedIdRef read to take effect.)

  // ---- breathing glow: a couple of shared materials' opacity oscillates gently --
  useEffect(() => {
    if (reduced || !active) return undefined
    let raf = 0
    const start = performance.now()
    const tick = (now) => {
      const t = now - start
      ;[1, 2].forEach((severity) => {
        const { min, max, periodMs } = BREATHE[severity]
        const phase = (Math.sin((t / periodMs) * 2 * Math.PI) + 1) / 2
        glow.bySeverity[severity].opacity = min + (max - min) * phase
      })
      if (selectedIdRef.current != null) {
        const { min, max, periodMs } = BREATHE.selected
        const phase = (Math.sin((t / periodMs) * 2 * Math.PI) + 1) / 2
        glow.selected.opacity = min + (max - min) * phase
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [glow, reduced, active])

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
    globe.pointOfView({ ...HOME_VIEW, altitude: aspect >= 1 ? HOME_ALTITUDE : HOME_ALTITUDE / aspect ** 0.85 }, 0)
    threeRef.current = { renderer }
    if (!active) globe.pauseAnimation?.() // AppShell may mount this while the Local view is showing
  }, [active])

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

  const handleCustomLayerClick = useCallback((point) => {
    const globe = globeRef.current
    if (globe) {
      const controls = globe.controls()
      controls.autoRotate = false // a click on the globe stops the spin for good, no resume
      const { altitude } = globe.pointOfView()
      globe.pointOfView({ lat: point.lat, lng: point.lng, altitude: Math.min(altitude, 1.6) }, reducedRef.current ? 0 : 900)
    }
    setSelectedId((current) => (current === point.id ? current : point.id))
    onSelectRef.current?.(toEvent(point))
  }, [])

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
  // (including the glow sprites' shared materials and their texture). We also release the
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
        {status === 'live' && `${events.length} events${lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}`}
        {status === 'loading' && 'Loading events…'}
        {status === 'offline' && `Can't reach the events API, retrying${events.length ? ' (showing last data)' : ''}`}
      </p>
    </div>
  )
}
