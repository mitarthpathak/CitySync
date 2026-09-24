import { useEffect, useState } from 'react'
import TagBadge from '../shared/TagBadge'

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '')

/**
 * feat/globe's integration point (see docs/CONTRACT.md). Stub: reads the
 * /api/globe envelope and renders it plainly, honesty tag included.
 * `onOpenLocal` is called when this view wants to hand off to LocalView - wire
 * that up for real once both sides have actual content.
 */
export function GlobeView({ onOpenLocal }) {
  const [envelope, setEnvelope] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/globe`)
      .then((res) => res.json())
      .then((body) => { if (!cancelled) setEnvelope(body) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  if (error) return <p>Couldn&apos;t reach /api/globe: {error}</p>
  if (!envelope) return <p>Loading globe…</p>

  return (
    <div>
      <p><TagBadge tag={envelope.tag} /> {envelope.source} · confidence {envelope.confidence} {envelope.stale ? '· stale' : ''}</p>
      <pre>{JSON.stringify(envelope.data, null, 2)}</pre>
      {onOpenLocal && <button onClick={onOpenLocal}>Open local</button>}
    </div>
  )
}
