import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, X } from 'lucide-react'
import { colorOf, nameOf } from '../lib/severity.js'
import { formatAbsolute, formatAgo } from '../lib/time.js'
import { useReducedMotion } from '../lib/useReducedMotion.js'
import { useIsMobile } from './useIsMobile.js'

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

const humanize = (key) =>
  key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

const humanizeValue = (value) => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

/** Plain-language rendering of an event's `raw` object: one row per field. */
function RawFields({ raw }) {
  const entries = Object.entries(raw ?? {})
  if (entries.length === 0) return <p className="cp-panel-empty">No extra details for this event.</p>
  return (
    <dl className="cp-panel-raw">
      {entries.map(([key, value]) => {
        const text = humanizeValue(value)
        const multiline = text.includes('\n')
        return (
          <div key={key}>
            <dt>{humanize(key)}</dt>
            <dd>{multiline ? <pre>{text}</pre> : text}</dd>
          </div>
        )
      })}
    </dl>
  )
}

/**
 * Shared slide-in detail panel for both the global and local views.
 *
 *   <EventPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
 *
 * Renders nothing while `event` is null; internally owns its own enter/exit animation,
 * so the parent only needs to hold the `selectedEvent` state.
 */
export default function EventPanel({ event, onClose }) {
  const reduced = useReducedMotion()
  const mobile = useIsMobile()
  const panelRef = useRef(null)
  const returnFocusTo = useRef(null)

  // Focus management: remember what had focus, move into the panel, trap Tab, restore on close.
  useEffect(() => {
    if (!event) return undefined
    returnFocusTo.current = document.activeElement
    const panel = panelRef.current
    const focusFirst = () => panel?.querySelector(FOCUSABLE)?.focus()
    const raf = requestAnimationFrame(focusFirst)

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown, true)
      const el = returnFocusTo.current
      if (el && document.contains(el)) el.focus()
    }
  }, [event, onClose])

  const transition = reduced ? { duration: 0 } : { duration: 0.34, ease: [0.4, 0, 0.2, 1] }
  const panelMotion = mobile
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } }

  return (
    <AnimatePresence>
      {event && (
        <div className="cp-panel-layer">
          <motion.div
            className="cp-panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            className="cp-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-panel-title"
            {...panelMotion}
            transition={transition}
          >
            <header className="cp-panel-head">
              <div>
                <p className="cp-label">{event.type.replace(/_/g, ' ')}</p>
                <h2 id="cp-panel-title">{event.title}</h2>
              </div>
              <button type="button" className="cp-iconbtn" onClick={onClose} aria-label="Close">
                <X />
              </button>
            </header>

            <div className="cp-panel-badges">
              <span className="cp-chip-severity" style={{ '--chip-color': colorOf(event.severity) }}>
                <i />Severity {event.severity} · {nameOf(event.severity)}
              </span>
              {event.isSimulated && <span className="cp-chip-sim">SIMULATED</span>}
            </div>

            <dl className="cp-panel-meta">
              <div>
                <dt>Source</dt>
                <dd>{event.source}</dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>{formatAgo(event.timestamp)} <span>({formatAbsolute(event.timestamp)})</span></dd>
              </div>
              <div>
                <dt>Coordinates</dt>
                <dd>
                  {event.lat.toFixed(4)}, {event.lng.toFixed(4)}{' '}
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${event.lat}&mlon=${event.lng}#map=13/${event.lat}/${event.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="cp-panel-maplink"
                  >
                    Open map <ExternalLink />
                  </a>
                </dd>
              </div>
            </dl>

            <p className="cp-label cp-panel-rawlabel">Details</p>
            <RawFields raw={event.raw} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
