import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, X } from 'lucide-react'
import { API_BASE } from './useEvents.js'
import { useReducedMotion } from '../lib/useReducedMotion.js'

const STATUS_LABEL = { live: 'Live', mock: 'Mock', down: 'Down', disabled: 'Disabled' }

/**
 * Judge-facing "what is this actually built on" panel: one row per backend source
 * (live and planned/disabled alike), reading GET /api/sources. Only ever shows
 * `keyConfigured` as a yes/no dot - never a key value.
 *
 *   <DataSourcesPanel open={open} onClose={() => setOpen(false)} />
 */
export default function DataSourcesPanel({ open, onClose }) {
  const reduced = useReducedMotion()
  const [sources, setSources] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(`${API_BASE}/api/sources`, { headers: { Accept: 'application/json' } })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data) => { if (!cancelled) setSources(data) })
      .catch((err) => { if (!cancelled) setError(err.message || 'request failed') })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const byCategory = new Map()
  for (const src of sources ?? []) {
    const list = byCategory.get(src.category) ?? []
    list.push(src)
    byCategory.set(src.category, list)
  }

  const transition = reduced ? { duration: 0 } : { duration: 0.34, ease: [0.4, 0, 0.2, 1] }

  return (
    <AnimatePresence>
      {open && (
        <div className="cp-panel-layer">
          <motion.div className="cp-panel-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition} onClick={onClose} />
          <motion.div
            className="cp-panel cp-sources-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-sources-title"
            initial={reduced ? { x: 0 } : { x: '100%' }}
            animate={{ x: 0 }}
            exit={reduced ? { x: 0 } : { x: '100%' }}
            transition={transition}
          >
            <header className="cp-panel-head">
              <div>
                <p className="cp-label">Architecture</p>
                <h2 id="cp-sources-title">Data sources</h2>
              </div>
              <button type="button" className="cp-iconbtn" onClick={onClose} aria-label="Close">
                <X />
              </button>
            </header>

            {error && <p className="cp-panel-empty">Couldn&apos;t reach /api/sources: {error}</p>}
            {!error && !sources && <p className="cp-panel-empty">Loading…</p>}

            {sources && [...byCategory.entries()].map(([category, list]) => (
              <section key={category} className="cp-sources-group">
                <p className="cp-label cp-sources-category">{category}</p>
                <ul className="cp-sources-list">
                  {list.map((src) => (
                    <li key={src.name} className="cp-sources-row">
                      <div className="cp-sources-row-top">
                        <span className={`cp-sources-dot is-${src.status}`} aria-hidden="true" />
                        <strong>{src.name}</strong>
                        <span className="cp-sources-status">{STATUS_LABEL[src.status] ?? src.status}</span>
                      </div>
                      <div className="cp-sources-row-meta">
                        <span>{src.attribution ?? 'CitySync'}</span>
                        {src.requiresKey && (
                          <span className="cp-sources-key" data-configured={src.keyConfigured}>
                            key {src.keyConfigured ? 'configured' : 'not set'}
                          </span>
                        )}
                        <span>{src.eventCount} event{src.eventCount === 1 ? '' : 's'}</span>
                        {src.docsUrl && (
                          <a href={src.docsUrl} target="_blank" rel="noreferrer noopener" className="cp-sources-docs">
                            Docs <ExternalLink />
                          </a>
                        )}
                      </div>
                      {src.reason && <p className="cp-sources-reason">{src.reason}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
