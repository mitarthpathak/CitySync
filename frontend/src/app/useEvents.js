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
  // The backend's local scope is currently fixed to Amer; lat/lng are sent for when it starts
  // honouring them. Until then, filterToLocation() below does the same job client-side.
  if (scope === 'local' && Number.isFinite(lat) && Number.isFinite(lng)) {
    url.searchParams.set('lat', lat)
    url.searchParams.set('lng', lng)
  }
  return url.toString()
}

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

/** GET /health -> { status, mode, feeds, count, error, lastUpdated }. For the top bar's live/mock pill. */
export function useHealth(pollMs = HEALTH_POLL_MS) {
  const [state, setState] = useState({ status: null, mode: null, feeds: null, count: null, error: null, lastUpdated: null })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        setState({ status: data.status ?? null, mode: data.mode ?? null, feeds: data.feeds ?? null, count: Number.isFinite(data.count) ? data.count : null, error: null, lastUpdated: new Date() })
      } catch (err) {
        if (cancelled) return
        setState((prev) => ({ ...prev, error: err.message || 'request failed' }))
      }
    }
    load()
    const timer = setInterval(() => { if (!document.hidden) load() }, pollMs)
    return () => { cancelled = true; clearInterval(timer) }
  }, [pollMs])

  return state
}
