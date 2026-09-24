import { Link, NavLink } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import ThemeButton from './ThemeButton.jsx'
import { useUtcClock } from './useUtcClock.js'
import { EVENTS_LIVE } from './data.js'

function GlobalStatus() {
  const clock = useUtcClock()
  return (
    <>
      <span className="cp-status">
        <span className="cp-live" aria-hidden="true"><i /></span>
        {EVENTS_LIVE} events live
      </span>
      <span className="cp-clock">{clock}</span>
    </>
  )
}

export default function Header({ view }) {
  const tab = ({ isActive }) => (isActive ? 'is-active' : undefined)
  return (
    <header className="cp-header">
      <Link to="/" className="cp-logo" aria-label="CityPulse: back to the landing page">
        <span className="cp-logo-mark" aria-hidden="true"><i /></span>
        <span>CityPulse</span>
      </Link>

      <nav className="cp-viewtoggle" aria-label="View">
        <NavLink to="/app" end className={tab}>Global</NavLink>
        <NavLink to="/app/local" className={tab}>Local <small>Amer</small></NavLink>
      </nav>

      <div className="cp-header-right">
        {view === 'local' ? (
          <span className="cp-place"><MapPin />Amer, Jaipur</span>
        ) : (
          <GlobalStatus />
        )}
        <ThemeButton />
      </div>
    </header>
  )
}
