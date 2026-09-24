import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
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
const MAX_RINGS = 24

// Local copies (served from /public/textures), so the demo works with no internet.
const texture = (file) => `${import.meta.env.BASE_URL}textures/${file}`
const MODES = {
  normal: { label: 'Normal', Icon: MapIcon, globeImageUrl: texture('earth-day.jpg'), bumpImageUrl: texture('earth-topology.png') },
  satellite: { label: 'Satellite', Icon: Satellite, globeImageUrl: texture('earth-blue-marble.jpg'), bumpImageUrl: texture('earth-topology.png') },
}
const MODE_KEY = 'cp.globeMode'

const ATMOSPHERE = { light: '#7fb2ff', dark: '#3b82f6' }

const HOME_VIEW = { lat: 26.9855, lng: 75.8513 } // Amer, Jaipur
const HOME_ALTITUDE = 1.5 // camera height in globe radii; 1.5 fills a landscape panel nicely
const AUTO_ROTATE_SPEED = 0.35
const RESUME_ROTATE_MS = 4000
const RENDERER_CONFIG = { antialias: true, alpha: true, powerPreference: 'high-performance' }
const NO_RINGS = []

// ---- point / ring styling (module level so props keep a stable identity) --------

const pointColor = (e) => colorOf(e.severity)
const pointAltitude = (e) => 0.006 + (e.severity - 1) * 0.014
const pointRadius = (e) => 0.22 + (e.severity - 1) * 0.11

// ringColor may return a function of t (0 = centre, 1 = edge): fade out as the ring grows.
const fade = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
  return (t) => `rgba(${rgb},${Math.max(0, 1 - t) ** 0.8})`
}
const RING_COLORS = { 4: fade(colorOf(4)), 5: fade(colorOf(5)) }
const ringColor = (e) => RING_COLORS[e.severity] || RING_COLORS[4]
const ringMaxRadius = (e) => (e.severity >= 5 ? 6 : 4)
const ringSpeed = (e) => (e.severity >= 5 ? 3 : 2)
const ringPeriod = (e) => (e.severity >= 5 ? 900 : 1500)

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

  // Shared fetch/poll/validate; on top of that, GlobeView's own identity-preserving merge
  // (see mergeEvents above) so a poll only touches the meshes that actually changed.
  const { events: fetchedEvents, loading, error, lastUpdated } = useEvents({ scope: 'global', pollMs })
  const [events, setEvents] = useState([])
  useEffect(() => setEvents((previous) => mergeEvents(previous, fetchedEvents)), [fetchedEvents])
  const status = error ? 'offline' : loading ? 'loading' : 'live'

  const points = useMemo(() => pickPoints(events), [events])
  const rings = useMemo(() => (reduced ? NO_RINGS : points.filter((e) => e.severity >= 4).slice(0, MAX_RINGS)), [points, reduced])

  // latest props without re-creating the globe callbacks
  const onSelectRef = useRef(onSelectEvent)
  useEffect(() => { onSelectRef.current = onSelectEvent }, [onSelectEvent])
  const reducedRef = useRef(reduced)
  useEffect(() => { reducedRef.current = reduced }, [reduced])

  // ---- auto-rotate: gentle, paused while the user is dragging / zooming --------
  const resumeTimer = useRef(0)
  const scheduleResume = useCallback(() => {
    clearTimeout(resumeTimer.current)
    resumeTimer.current = setTimeout(() => {
      const controls = globeRef.current?.controls()
      if (controls && !reducedRef.current) controls.autoRotate = true
    }, RESUME_ROTATE_MS)
  }, [])

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
    controls.minDistance = 130
    controls.maxDistance = 450

    const onStart = () => { clearTimeout(resumeTimer.current); controls.autoRotate = false }
    const onEnd = () => { if (!reducedRef.current) scheduleResume() }
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)
    detachControls.current = () => {
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
    }

    // portrait panels are narrower than tall: pull the camera back so the globe is not cropped
    const { width, height } = sizeRef.current
    const aspect = width && height ? width / height : 1
    globe.pointOfView({ ...HOME_VIEW, altitude: aspect >= 1 ? HOME_ALTITUDE : HOME_ALTITUDE / aspect ** 0.85 }, 0)
    threeRef.current = { renderer }
    if (!active) globe.pauseAnimation?.() // AppShell may mount this while the Local view is showing
  }, [scheduleResume, active])

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

  const handlePointClick = useCallback((point) => {
    const globe = globeRef.current
    if (globe) {
      const controls = globe.controls()
      controls.autoRotate = false
      scheduleResume()
      const { altitude } = globe.pointOfView()
      globe.pointOfView({ lat: point.lat, lng: point.lng, altitude: Math.min(altitude, 1.6) }, reducedRef.current ? 0 : 900)
    }
    onSelectRef.current?.(toEvent(point))
  }, [scheduleResume])

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
  // react-globe.gl empties the scene and disposes geometries / materials / maps on unmount. We also
  // release the WebGL context so its GPU memory (textures included) is freed right away instead of
  // waiting for GC. The mounted flag keeps React StrictMode's throw-away mount/unmount cycle from
  // destroying a live globe.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(resumeTimer.current)
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
              showAtmosphere
              atmosphereColor={ATMOSPHERE[resolvedTheme]}
              atmosphereAltitude={0.2}
              onGlobeReady={handleReady}
              pointsData={points}
              pointLat="lat"
              pointLng="lng"
              pointColor={pointColor}
              pointAltitude={pointAltitude}
              pointRadius={pointRadius}
              pointResolution={8}
              pointsMerge={false}
              pointsTransitionDuration={reduced ? 0 : 600}
              pointLabel={pointLabel}
              onPointClick={handlePointClick}
              ringsData={rings}
              ringLat="lat"
              ringLng="lng"
              ringColor={ringColor}
              ringMaxRadius={ringMaxRadius}
              ringPropagationSpeed={ringSpeed}
              ringRepeatPeriod={ringPeriod}
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

      <p className="gv-status" data-status={status} aria-live="polite">
        <i aria-hidden="true" />
        {status === 'live' && `${events.length} events${lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}`}
        {status === 'loading' && 'Loading events…'}
        {status === 'offline' && `Can't reach the events API, retrying${events.length ? ' (showing last data)' : ''}`}
      </p>
    </div>
  )
}
