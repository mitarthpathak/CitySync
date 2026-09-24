import { useEffect, useState } from 'react'
import TagBadge from '../shared/TagBadge'

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '')

/**
 * feat/local's integration point (see docs/CONTRACT.md). Stub: reads the
 * /api/local envelope and renders it plainly, honesty tag included. Real markup,
 * data shape, and thresholds belong to feat/local from here on.
 */
export default function LocalView() {
  const [envelope, setEnvelope] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/local`)
      .then((res) => res.json())
      .then((body) => { if (!cancelled) setEnvelope(body) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  if (error) return <p>Couldn&apos;t reach /api/local: {error}</p>
  if (!envelope) return <p>Loading local…</p>

  return (
    <div>
      <p><TagBadge tag={envelope.tag} /> {envelope.source} · confidence {envelope.confidence} {envelope.stale ? '· stale' : ''}</p>
      <pre>{JSON.stringify(envelope.data, null, 2)}</pre>
    </div>
  )
}
