import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import { Map as MapIcon, Satellite } from 'lucide-react'
import { useTheme } from './useTheme.js'
import './GlobeView.css'

/**
 * GlobeView: the GLOBAL view's 3D globe.
 *
 *   <GlobeView onSelectEvent={(event) => ...} theme="light" | "dark" />
 *
 * Props (all optional)
 *   onSelectEvent(event)  called with the clicked event, exactly the backend shape
 *                         { id, type, title, lat, lng, timestamp, severity, source, isSimulated, raw }
 *   theme                 "light" | "dark"; defaults to the app theme (<html class="dark">)
 *   apiUrl                events endpoint; defaults to VITE_API_URL or http://localhost:3000, plus /events?scope=global
 *   pollMs                refresh interval, default 45 000
 *
 * It fills its parent (position: relative; width/height: 100%), so give the parent a size.
 */

// ---- config ---------------------------------------------------------------

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')
const DEFAULT_URL = `${API_BASE}/events?scope=global`
const DEFAULT_POLL_MS = 45_000
const MIN_REFETCH_GAP_MS = 10_000 // don't re-fetch on tab focus if we just did

const MAX_POINTS = 500 // three.js cost grows with meshes; keep the most severe / newest
const MAX_RINGS = 24

// Local copies (served from /public/textures), so the demo works with no internet.
const texture = (file) => `${import.meta.env.BASE_URL}textures/${file}`
const MODES = {
  normal: { label: 'Normal', Icon: MapIcon, globeImageUrl: texture('earth-day.jpg'), bumpImageUrl: texture('earth-topology.png') },
  satellite: { label: 'Satellite', Icon: Satellite, globeImageUrl: texture('earth-blue-marble.jpg'), bumpImageUrl: texture('earth-topology.png') },
}
const MODE_KEY = 'cp.globeMode'

const SEVERITY_COLORS = { 1: '#94a3b8', 2: '#34c26f', 3: '#f2b01e', 4: '#f97316', 5: '#ef3b4a' } // slate, green, amber, orange, red
const SEVERITY_NAMES = { 1: 'Info', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Critical' }
const ATMOSPHERE = { light: '#7fb2ff', dark: '#3b82f6' }

const HOME_VIEW = { lat: 26.9855, lng: 75.8513 } // Amer, Jaipur
const HOME_ALTITUDE = 1.5 // camera height in globe radii; 1.5 fills a landscape panel nicely
const AUTO_ROTATE_SPEED = 0.35
const RESUME_ROTATE_MS = 4000
const RENDERER_CONFIG = { antialias: true, alpha: true, powerPreference: 'high-performance' }
const NO_RINGS = []

// ---- point / ring styling (module level so props keep a stable identity) --------

const colorOf = (severity) => SEVERITY_COLORS[severity] || SEVERITY_COLORS[1]
const pointColor = (e) => colorOf(e.severity)
const pointAltitude = (e) => 0.006 + (e.severity - 1) * 0.014
const pointRadius = (e) => 0.22 + (e.severity - 1) * 0.11

// ringColor may return a function of t (0 = centre, 1 = edge): fade out as the ring grows.
const fade = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
  return (t) => `rgba(${rgb},${Math.max(0, 1 - t) ** 0.8})`
}
const RING_COLORS = { 4: fade(SEVERITY_COLORS[4]), 5: fade(SEVERITY_COLORS[5]) }
const ringColor = (e) => RING_COLORS[e.severity] || RING_COLORS[4]
const ringMaxRadius = (e) => (e.severity >= 5 ? 6 : 4)
const ringSpeed = (e) => (e.severity >= 5 ? 3 : 2)
const ringPeriod = (e) => (e.severity >= 5 ? 900 : 1500)

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])

function ago(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (Number.isNaN(minutes)) return ''
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

// Event titles come from third-party feeds, and the globe tooltip is rendered as HTML: always escape.
function pointLabel(e) {
  const time = ago(e.timestamp)
  return (
    `<div class="gv-tip">` +
    `<div class="gv-tip-title">${esc(e.title)}</div>` +
    `<div class="gv-tip-meta">` +
    `<i class="gv-tip-dot" style="background:${colorOf(e.severity)}"></i>` +
    `<span>${esc(e.source)}</span>` +
    `<span>${esc(SEVERITY_NAMES[e.severity] || '')} (${e.severity})${time ? ` · ${esc(time)}` : ''}</span>` +
    (e.isSimulated ? `<b class="gv-tip-tag">SIMULATED</b>` : '') +
    `</div></div>`
  )
}

// ---- data -----------------------------------------------------------------

/** Accept only well-formed events; clamp severity into 1..5. Returns null for junk. */
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null
  const { id, lat, lng } = raw
  if (typeof id !== 'string' || !id) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const severity = Math.min(5, Math.max(1, Math.round(Number(raw.severity)) || 1))
  return severity === raw.severity ? raw : { ...raw, severity }
}

const sameEvent = (a, b) =>
  a.timestamp === b.timestamp && a.severity === b.severity && a.title === b.title && a.lat === b.lat && a.lng === b.lng && a.isSimulated === b.isSimulated

/**
 * Keep the previous object for every event that did not change. The globe binds one mesh to each
 * data object, so reusing objects means a poll only adds / removes the meshes that really changed.
 */
function mergeEvents(previous, incoming) {
  const before = new Map(previous.map((e) => [e.id, e]))
  const seen = new Set()
  const next = []
  for (const raw of incoming) {
    const event = normalize(raw)
    if (!event || seen.has(event.id)) continue
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

/** The event exactly as the backend sent it (drops the fields the globe adds to its data objects). */
const toEvent = ({ id, type, title, lat, lng, timestamp, severity, source, isSimulated, raw }) => ({
  id, type, title, lat, lng, timestamp, severity, source, isSimulated, raw,
})

function useEvents(url, pollMs) {
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('loading') // loading | live | offline
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    let cancelled = false
    let controller
    let lastFetch = 0

    const load = async () => {
      controller?.abort()
      controller = new AbortController()
      lastFetch = Date.now()
      try {
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!Array.isArray(data)) throw new Error('unexpected response')
        if (cancelled) return
        setEvents((previous) => mergeEvents(previous, data))
        setUpdatedAt(new Date())
        setStatus('live')
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return
        setStatus('offline') // keep showing the last good data
      }
    }

    load()
    const timer = setInterval(() => { if (!document.hidden) load() }, pollMs)
    const onVisible = () => { if (!document.hidden && Date.now() - lastFetch > MIN_REFETCH_GAP_MS) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      controller?.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [url, pollMs])

  return { events, status, updatedAt }
}

// ---- small hooks ----------------------------------------------------------

function useReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return undefined
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

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

export default function GlobeView({ onSelectEvent, theme, apiUrl = DEFAULT_URL, pollMs = DEFAULT_POLL_MS }) {
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

  const { events, status, updatedAt } = useEvents(apiUrl, pollMs)
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
  }, [scheduleResume])

  // reduced-motion can change while the page is open
  useEffect(() => {
    const controls = globeRef.current?.controls()
    if (controls && reduced) controls.autoRotate = false
  }, [reduced])

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

  const active = MODES[mode]
  const ready = size.width > 0 && size.height > 0

  return (
    <div ref={rootRef} className="gv-root" data-theme={resolvedTheme} data-mode={mode}>
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
              globeImageUrl={active.globeImageUrl}
              bumpImageUrl={active.bumpImageUrl}
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
        {status === 'live' && `${events.length} events${updatedAt ? ` · updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}`}
        {status === 'loading' && 'Loading events…'}
        {status === 'offline' && `Can't reach the events API, retrying${events.length ? ' (showing last data)' : ''}`}
      </p>
    </div>
  )
}
