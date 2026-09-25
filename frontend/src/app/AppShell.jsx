import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Header from './Header.jsx'
import ThemeButton from './ThemeButton.jsx'
import GlobalView from './GlobalView.jsx'
import LocalView from './LocalView.jsx'
import EventPanel from './EventPanel.jsx'
import DataSourcesPanel from './DataSourcesPanel.jsx'
import { useSelectedLocation } from './useSelectedLocation.js'
import { useReducedMotion } from '../lib/useReducedMotion.js'

const TRANSITION_MS = 0.34 // ~340ms, within the requested 300-400ms range
const EASE = [0.4, 0, 0.2, 1] // calm, no overshoot

// The Global/Local switch, floating over everything as its own fixed pill (a "dynamic
// island") instead of living inside the header row, so it never scrolls out of reach on
// the tall Local screen.
function ViewIsland() {
  const tab = ({ isActive }) => (isActive ? 'is-active' : undefined)
  return (
    <nav className="cp-island" aria-label="View">
      <NavLink to="/app" end className={tab}><span aria-hidden="true">{'\u{1F30D}'}</span> Global</NavLink>
      <NavLink to="/app/local" className={tab}><span aria-hidden="true">{'\u{1F4CD}'}</span> Local</NavLink>
    </nav>
  )
}

/**
 * Owns the Global ⇄ Local toggle, the shared theme, the selected-location and
 * selected-event state, and crossfades between the two views. GlobeView (expensive to
 * re-init) is kept permanently mounted and just has its render loop paused while hidden;
 * LocalView (cheap Leaflet map) mounts and unmounts normally.
 */
export default function AppShell() {
  const { pathname } = useLocation()
  const view = pathname.replace(/\/+$/, '').endsWith('/local') ? 'local' : 'global'
  const reduced = useReducedMotion()

  const [location, setLocation] = useSelectedLocation()
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showSources, setShowSources] = useState(false)

  // The app has its own palette; scope it to <body> while this screen is mounted.
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'CitySync: Live overview'
    document.body.classList.add('cp-body')
    return () => {
      document.title = previousTitle
      document.body.classList.remove('cp-body')
    }
  }, [])

  const transition = reduced ? { duration: 0 } : { duration: TRANSITION_MS, ease: EASE }
  const activeVariant = { opacity: 1, scale: 1 }
  const hiddenVariant = { opacity: 0, scale: reduced ? 1 : 0.98 }

  return (
    <div className="cp-app">
      <Header view={view} location={location} onOpenSources={() => setShowSources(true)} />
      <ViewIsland />
      <main className="cp-main">
        <div className="cp-view-stack">
          {/* Always mounted: switching to Local must not tear down (and later re-init) the globe. */}
          <motion.div
            className="cp-view-layer"
            animate={view === 'global' ? activeVariant : hiddenVariant}
            transition={transition}
            style={{ pointerEvents: view === 'global' ? 'auto' : 'none' }}
            aria-hidden={view !== 'global'}
          >
            <GlobalView active={view === 'global'} onSelectEvent={setSelectedEvent} />
          </motion.div>

          <AnimatePresence>
            {view === 'local' && (
              <motion.div
                key="local"
                className="cp-view-layer"
                initial={reduced ? activeVariant : hiddenVariant}
                animate={activeVariant}
                exit={reduced ? activeVariant : hiddenVariant}
                transition={transition}
              >
                <LocalView location={location} onLocationChange={setLocation} onSelectEvent={setSelectedEvent} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <EventPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      <DataSourcesPanel open={showSources} onClose={() => setShowSources(false)} />
      <ThemeButton className="cp-float-theme" />

      {/* A sibling of .cp-view-stack, not inside it: GlobalView's layer is
          transform-animated by framer-motion, and a transformed ancestor would
          become this element's containing block and break position:fixed. GlobalView
          portals its live-feed ticker into this slot whenever it's the active view. */}
      <div id="cp-feedrow-slot" />
    </div>
  )
}
