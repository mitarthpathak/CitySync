import { useEffect, useRef, useState } from 'react'
import { LocateFixed, X } from 'lucide-react'
import { DEFAULT_LOCATION, LOCATIONS, findLocationById, toCustomLocation } from '../config/locations.config.js'
import { LOCAL_RADIUS_KM } from './useEvents.js'

const NOTE_TEXT = {
  denied: "Location permission denied — showing Amer, Jaipur.",
  unavailable: "Location isn't available on this device — showing Amer, Jaipur.",
  timeout: "Location request timed out — showing Amer, Jaipur.",
  error: "Couldn't get your location — showing Amer, Jaipur.",
}
const NOTE_AUTOHIDE_MS = 6000

/**
 * Chooses the point that drives the LOCAL view: a preset dropdown, or "Use my location"
 * via the browser Geolocation API. Every failure mode falls back to the default location
 * without ever blocking the UI (a small dismissible note explains what happened).
 */
export default function LocationSelector({ location, onChange }) {
  const [locating, setLocating] = useState(false)
  const [note, setNote] = useState(null) // null | 'denied' | 'unavailable' | 'timeout' | 'error'
  const noteTimer = useRef(0)

  useEffect(() => () => clearTimeout(noteTimer.current), [])

  const showNote = (reason) => {
    setNote(reason)
    clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => setNote(null), NOTE_AUTOHIDE_MS)
  }

  const useMyLocation = () => {
    // A truthiness check, not `'geolocation' in navigator`: some environments expose the
    // property as null/undefined rather than omitting it, and either way there's nothing to call.
    if (!navigator.geolocation) {
      onChange(DEFAULT_LOCATION)
      showNote('unavailable')
      return
    }
    setLocating(true)
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocating(false)
          onChange(toCustomLocation(position.coords.latitude, position.coords.longitude))
        },
        (error) => {
          setLocating(false)
          onChange(DEFAULT_LOCATION)
          // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT (GeolocationPositionError)
          showNote(error.code === 1 ? 'denied' : error.code === 2 ? 'unavailable' : error.code === 3 ? 'timeout' : 'error')
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      )
    } catch {
      // A non-standard geolocation shim that throws synchronously instead of using the
      // error callback; still never leave the UI stuck (button disabled, no feedback).
      setLocating(false)
      onChange(DEFAULT_LOCATION)
      showNote('error')
    }
  }

  const onPreset = (e) => {
    const preset = findLocationById(e.target.value)
    if (preset) onChange(preset)
  }

  return (
    <div className="cp-locpicker">
      <div className="cp-locpicker-row">
        <button type="button" className="cp-locbtn" onClick={useMyLocation} disabled={locating} aria-busy={locating}>
          <LocateFixed className={locating ? 'is-spinning' : undefined} />
          {locating ? 'Locating…' : 'Use my location'}
        </button>

        <select className="cp-locselect" value={location.id === 'custom' ? 'custom' : location.id} onChange={onPreset} aria-label="Preset location">
          {location.id === 'custom' && <option value="custom">My location (current)</option>}
          {LOCATIONS.map((loc) => (
            <option key={loc.id} value={loc.id}>{loc.label}</option>
          ))}
        </select>

        <span className="cp-locradius">Showing events within {LOCAL_RADIUS_KM} km</span>
      </div>

      {note && (
        <p className="cp-locnote" role="status">
          <span>{NOTE_TEXT[note]}</span>
          <button type="button" onClick={() => setNote(null)} aria-label="Dismiss"><X /></button>
        </p>
      )}
    </div>
  )
}
