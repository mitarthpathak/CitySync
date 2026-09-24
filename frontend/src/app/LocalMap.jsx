import { Layers, LocateFixed } from 'lucide-react'

// Illustrative terrain. Coordinates are in the map's own 878 x 327 space.
const W = 878
const H = 327
const pct = (value, total) => `${(value / total) * 100}%`

const PINS = [
  { id: 'you', tone: 'blue', x: 214, y: 93, focus: true },
  { id: 'fort', tone: 'amber', x: 565, y: 153, label: 'Amer Fort', strong: true, labelX: 520, labelY: 126 },
  { id: 'kunda', tone: 'crimson', x: 310, y: 242, label: 'Kunda', labelX: 264, labelY: 220 },
]

function PinIcon() {
  return (
    <svg className="cp-pin-icon" width="24" height="28" viewBox="0 0 24 28" aria-hidden="true">
      <path d="M12 27.2 4.46 20.55A11.4 11.4 0 1 1 19.54 20.55Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  )
}

export default function LocalMap() {
  return (
    <div className="cp-map" role="img" aria-label="Simulated map of activity around Amer">
      <svg className="cp-map-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {/* hex-ish street grid: full-height verticals every 42px, crossing diagonals every 84px */}
          <pattern id="cp-hex" width="84" height="85" y="64" patternUnits="userSpaceOnUse">
            <path d="M0.5 0V85M42.5 0V85" className="cp-hex-v" fill="none" />
            <path d="M0 35 84 85M0 85 84 35" className="cp-hex-d" fill="none" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#cp-hex)" />
        <ellipse cx="369" cy="94.5" rx="212" ry="29" transform="rotate(-19.7 369 94.5)" className="cp-map-zone" />
        <path d="M28 176.7 546 -0.3M203.5 99 313 327M175 204 453 326" className="cp-map-road" fill="none" />
      </svg>

      {PINS.map(({ id, tone, x, y, focus, label, strong, labelX, labelY }) => (
        <span key={id}>
          <span className={`cp-pin cp-pin--${tone}`} style={{ left: pct(x, W), top: pct(y, H) }}>
            {focus && (
              <>
                <i className="cp-pin-halo" />
                <i className="cp-pin-ring" />
              </>
            )}
            <PinIcon />
          </span>
          {label && (
            <span
              className={`cp-pin-label${strong ? ' is-strong' : ''}`}
              style={{ left: pct(labelX, W), top: pct(labelY, H) }}
            >
              {label}
            </span>
          )}
        </span>
      ))}

      <div className="cp-map-controls">
        <button type="button" aria-label="Recenter map"><LocateFixed /></button>
        <button type="button" aria-label="Map layers"><Layers /></button>
      </div>
      <p className="cp-map-credit">© CityPulse map / simulated terrain</p>
    </div>
  )
}
