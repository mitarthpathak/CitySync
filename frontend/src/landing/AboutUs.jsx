import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { EASE } from './motion'
import { useReducedMotion } from '../lib/useReducedMotion'

// The team. Edit here: `linkedin` is a full profile URL; leave it '' to hide that member's link.
const MEMBERS = [
  { name: 'Mitarth Pathak', role: 'Engineering, UI & 3D', linkedin: '' },
  { name: 'Navneet Singh', role: 'Technology & AI', linkedin: '' },
  { name: 'Gaurav Soni', role: 'Design & Experience', linkedin: '' },
  { name: 'Deep Panchal', role: 'Product & Vision', linkedin: '' },
  { name: 'Nooren Qureshi', role: 'Research & Community', linkedin: '' },
]

/** "About us" dialog: what CitySync is, and who builds it. */
export default function AboutUs({ open, onClose }) {
  const reduced = useReducedMotion()
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const returnTo = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
      if (returnTo instanceof HTMLElement) returnTo.focus()
    }
  }, [open, onClose])

  const fade = reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="about-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
          <motion.div
            className="about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: reduced ? 0 : 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 12 }}
            transition={fade}
          >
            <button ref={closeRef} type="button" className="about-close" onClick={onClose} aria-label="Close about us"><X /></button>
            <p className="eyebrow">About us</p>
            <h2 id="about-title">Making the city<br /><em>legible for everyone.</em></h2>
            <div className="about-copy">
              <p>CitySync is building a clearer way to understand the place you live.</p>
              <p>We bring weather, air quality, traffic, official alerts and local signals into one calm, honest pulse.</p>
              <p>Every reading carries its source and how much to trust it, so nothing simulated poses as real.</p>
              <p>Together, we are turning scattered civic data into shared sense.</p>
            </div>
            <ul className="about-team" aria-label="Team members">
              {MEMBERS.map((m) => (
                <li key={m.name}>
                  <span className="about-avatar" aria-hidden="true">{m.name.charAt(0)}</span>
                  <strong>{m.name}</strong>
                  <span className="about-role">{m.role}</span>
                  {m.linkedin && (
                    <a className="about-linkedin" href={m.linkedin} target="_blank" rel="noreferrer">
                      <span aria-hidden="true">in</span>LinkedIn
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
