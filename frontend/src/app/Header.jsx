import { Link } from 'react-router-dom'
import { Database, MapPin } from 'lucide-react'
import ThemeButton from './ThemeButton.jsx'
import { useHealth } from './useEvents.js'

function HealthStatus() {
  const { status, mode, count, liveSources, error } = useHealth()
  const known = status === 'ok'
  // "7 live sources · 312 events": the simulator never counts as a live source (backend rule).
  const sources = Number.isFinite(liveSources) ? `${liveSources} live source${liveSources === 1 ? '' : 's'} · ` : ''
  const label = !known ? 'Reconnecting…' : mode === 'mock' ? `${count ?? 0} events (mock)` : `${sources}${count ?? 0} events`
  return (
    <span className="cp-status" data-state={!known ? 'offline' : mode === 'mock' ? 'mock' : 'live'} title={error || undefined}>
      <span className="cp-live" aria-hidden="true"><i /></span>
      {label}
    </span>
  )
}

// The CitySync mark: a dark disc with a green rounded-square ring overlapping its lower
// right, the disc drawn on top so it cuts into the ring's inner-left edge. The disc uses
// currentColor (follows the app theme, like the rest of the header); the ring stays the
// fixed brand green in both themes.
function Logo() {
  return (
    <svg className="cp-logo-mark" viewBox="0 0 44 30" aria-hidden="true">
      <mask id="cp-logo-ring-hole">
        <rect x="0" y="0" width="44" height="30" fill="#fff" />
        <rect x="24" y="9" width="10" height="10" rx="4" fill="#000" />
      </mask>
      <rect x="18" y="3" width="22" height="22" rx="8" fill="#1cb98a" mask="url(#cp-logo-ring-hole)" />
      <circle cx="14" cy="15" r="14" fill="currentColor" />
    </svg>
  )
}

export default function Header({ view, location, onOpenSources }) {
  return (
    <header className="cp-header">
      <Link to="/" className="cp-logo" aria-label="CitySync: back to the landing page">
        <Logo />
        <span>CitySync</span>
      </Link>

      <div className="cp-header-right">
        <HealthStatus />
        {view === 'local' && location && (
          <span className="cp-place"><MapPin />{location.label}</span>
        )}
        <button type="button" className="cp-iconbtn" onClick={onOpenSources} aria-label="Data sources">
          <Database />
        </button>
        <ThemeButton />
      </div>
    </header>
  )
}
