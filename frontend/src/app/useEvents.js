import { useEffect, useState } from 'react'
import { haversineKm } from '../lib/geo.js'
import { isValidEvent } from '../lib/severity.js'

// Shared by GlobalView (globe) and LocalView (map): one fetch/poll implementation, one
// event schema check, one client-side distance filter. Never hardcode this URL elsewhere.
export const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '')

export const LOCAL_RADIUS_KM = 15 // matches the backend's local-scope radius around the given point
const DEFAULT_POLL_MS = 45_000
const MIN_REFETCH_GAP_MS = 10_000 // skip a duplicate fetch if the tab was hidden only briefly

function buildUrl({ scope, lat, lng }) {
  const url = new URL(`${API_BASE}/events`)
  url.searchParams.set('scope', scope)
  // The backend centers its local-scope radius on this point (defaults to Amer without it).
  if (scope === 'local' && Number.isFinite(lat) && Number.isFinite(lng)) {
    url.searchParams.set('lat', lat)
    url.searchParams.set('lng', lng)
  }
  return url.toString()
}

// The backend already scopes to this radius server-side; this is just a defensive
// second pass (e.g. against a stale cached response) and should normally be a no-op.
function filterToLocation(events, scope, lat, lng) {
  if (scope !== 'local' || !Number.isFinite(lat) || !Number.isFinite(lng)) return events
  return events.filter((e) => haversineKm(lat, lng, e.lat, e.lng) <= LOCAL_RADIUS_KM)
}

/**
 * useEvents({ scope, lat, lng, pollMs })
 *   scope: "global" | "local"
 *   lat, lng: required for "local"; ignored for "global"
 * -> { events, loading, error, lastUpdated, radiusKm }
 *
 * Polls on an interval (paused while the tab is hidden), keeps the last good data on
 * screen through a failed poll, and re-validates every event against the exact backend
 * schema (silently dropping anything malformed) before applying the local-scope filter.
 */
export function useEvents({ scope = 'global', lat, lng, pollMs = DEFAULT_POLL_MS } = {}) {
  const [state, setState] = useState({ events: [], loading: true, error: null, lastUpdated: null })

  useEffect(() => {
    let cancelled = false
    let controller
    let lastFetchAt = 0

    const load = async () => {
      controller?.abort()
      controller = new AbortController()
      lastFetchAt = Date.now()
      try {
        const res = await fetch(buildUrl({ scope, lat, lng }), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!Array.isArray(data)) throw new Error('unexpected response shape')
        if (cancelled) return
        const events = filterToLocation(data.filter(isValidEvent), scope, lat, lng)
        setState({ events, loading: false, error: null, lastUpdated: new Date() })
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return
        // Keep whatever data we already have on screen; just surface the error.
        setState((prev) => ({ ...prev, loading: false, error: err.message || 'request failed' }))
      }
    }

    setState((prev) => ({ ...prev, loading: prev.events.length === 0, error: null }))
    load()
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, pollMs)
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastFetchAt > MIN_REFETCH_GAP_MS) load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      controller?.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // lat/lng are numbers (or undefined); re-run the effect whenever the selected point changes.
  }, [scope, lat, lng, pollMs])

  return { ...state, radiusKm: scope === 'local' ? LOCAL_RADIUS_KM : null }
}

const HEALTH_POLL_MS = 20_000

// One shared /health poller for every subscriber (top bar + layer panel), not one each.
const EMPTY_HEALTH = { status: null, mode: null, feeds: null, count: null, liveSources: null, layers: null, sources: null, error: null, lastUpdated: null }
const health = { state: EMPTY_HEALTH, listeners: new Set(), timer: null }

async function loadHealth() {
  let next
  try {
    const res = await fetch(`${API_BASE}/health`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    next = {
      status: data.status ?? null,
      mode: data.mode ?? null,
      feeds: data.feeds ?? null,
      count: Number.isFinite(data.count) ? data.count : null,
      liveSources: Number.isFinite(data.liveSources) ? data.liveSources : null,
      layers: data.layers && typeof data.layers === 'object' ? data.layers : null,
      sources: data.sources && typeof data.sources === 'object' ? data.sources : null,
      error: null,
      lastUpdated: new Date(),
    }
  } catch (err) {
    next = { ...health.state, error: err.message || 'request failed' }
  }
  health.state = next
  health.listeners.forEach((fn) => fn(next))
}

/** GET /health -> { status, mode, feeds, count, liveSources, layers, sources, error, lastUpdated }. */
export function useHealth() {
  const [state, setState] = useState(health.state)
  useEffect(() => {
    health.listeners.add(setState)
    if (health.listeners.size === 1) {
      loadHealth()
      health.timer = setInterval(() => { if (!document.hidden) loadHealth() }, HEALTH_POLL_MS)
    } else {
      setState(health.state)
    }
    return () => {
      health.listeners.delete(setState)
      if (health.listeners.size === 0) clearInterval(health.timer)
    }
  }, [])
  return state
}

const BRIEF_POLL_MS = 60_000
const BRIEF_PENDING_RETRY_MS = 4_000 // cold point: the backend is fetching its forecast right now

/** GET /api/brief for a point -> { brief, error }. Re-polls quickly while the forecast warms up. */
export function useBrief({ lat, lng }) {
  const [state, setState] = useState({ brief: null, error: null })

  useEffect(() => {
    let cancelled = false
    let timer
    const load = async () => {
      let delay = BRIEF_POLL_MS
      try {
        const url = new URL(`${API_BASE}/api/brief`)
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          url.searchParams.set('lat', lat)
          url.searchParams.set('lng', lng)
        }
        const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const brief = await res.json()
        if (cancelled) return
        setState({ brief, error: null })
        if (brief.forecast?.pending) delay = BRIEF_PENDING_RETRY_MS
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, error: err.message || 'request failed' }))
      }
      if (!cancelled) timer = setTimeout(load, delay)
    }
    setState({ brief: null, error: null })
    load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [lat, lng])

  return state
}
