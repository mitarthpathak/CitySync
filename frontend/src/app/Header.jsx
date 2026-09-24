import { Link, NavLink } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import ThemeButton from './ThemeButton.jsx'
import { useHealth } from './useEvents.js'

function HealthStatus() {
  const { status, mode, count, error } = useHealth()
  const known = status === 'ok'
  const label = !known ? 'Reconnecting…' : mode === 'mock' ? `${count ?? 0} events (mock)` : `${count ?? 0} events live`
  return (
    <span className="cp-status" data-state={!known ? 'offline' : mode === 'mock' ? 'mock' : 'live'} title={error || undefined}>
      <span className="cp-live" aria-hidden="true"><i /></span>
      {label}
    </span>
  )
}

export default function Header({ view, location }) {
  const tab = ({ isActive }) => (isActive ? 'is-active' : undefined)
  return (
    <header className="cp-header">
      <Link to="/" className="cp-logo" aria-label="CityPulse: back to the landing page">
        <span className="cp-logo-mark" aria-hidden="true"><i /></span>
        <span>CityPulse</span>
      </Link>

      <nav className="cp-viewtoggle" aria-label="View">
        <NavLink to="/app" end className={tab}><span aria-hidden="true">{'\u{1F30D}'}</span> Global</NavLink>
        <NavLink to="/app/local" className={tab}><span aria-hidden="true">{'\u{1F4CD}'}</span> Local</NavLink>
      </nav>

      <div className="cp-header-right">
        <HealthStatus />
        {view === 'local' && location && (
          <span className="cp-place"><MapPin />{location.label}</span>
        )}
        <ThemeButton />
      </div>
    </header>
  )
}
