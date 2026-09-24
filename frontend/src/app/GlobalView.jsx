import { lazy, Suspense, useState } from 'react'
import { AirVent, ArrowUp, Bell, ChevronRight, CloudRain, Radio, Waves } from 'lucide-react'
import { liveFeed, severity, signals } from './data.js'

// The globe (react-globe.gl + three.js) is big and only this screen needs it, so it loads on demand.
const GlobeView = lazy(() => import('./GlobeView.jsx'))

const LAYERS = [
  { id: 'earthquakes', label: 'Earthquakes', Icon: Waves },
  { id: 'weather', label: 'Weather', Icon: CloudRain },
  { id: 'air_quality', label: 'Air Quality', Icon: AirVent },
  { id: 'incidents', label: 'Incidents', Icon: Bell },
]

export default function GlobalView({ active = true, onSelectEvent }) {
  const [layers, setLayers] = useState({ earthquakes: true, weather: true, air_quality: true, incidents: true })
  const toggleLayer = (id) => setLayers((current) => ({ ...current, [id]: !current[id] }))

  return (
    <div className="cp-container">
      <section className="cp-hero">
        <div>
          <p className="cp-eyebrow">Live overview / World</p>
          <h1 className="cp-h1">The world, in pulse.</h1>
        </div>
        <p className="cp-updating"><Radio />Updating continuously</p>
      </section>

      <section className="cp-globe-grid" aria-label="Global overview">
        <aside className="cp-rail cp-rail-left">
          <p className="cp-label">Layers</p>
          <div className="cp-chips">
            {LAYERS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className="cp-chip"
                aria-pressed={layers[id]}
                onClick={() => toggleLayer(id)}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>

          <p className="cp-label cp-label-severity">Severity</p>
          <ul className="cp-legend">
            {severity.map(({ id, label }) => (
              <li key={id}><i className={`cp-dot cp-dot--${id}`} />{label}</li>
            ))}
          </ul>
        </aside>

        <div className="cp-globe-panel">
          <Suspense fallback={null}>
            <GlobeView active={active} onSelectEvent={onSelectEvent} />
          </Suspense>
          <span className="cp-coord cp-coord-n" aria-hidden="true">N 42°</span>
          <span className="cp-coord cp-coord-e" aria-hidden="true">E 74°</span>
        </div>

        <aside className="cp-rail cp-rail-right">
          <p className="cp-label">Signals index</p>
          <p className="cp-stat">
            <strong>{signals.index}</strong>
            <span>/100</span>
          </p>
          <p className="cp-trend"><ArrowUp />{signals.delta}</p>

          <p className="cp-label cp-label-coverage">Coverage</p>
          <p className="cp-stat cp-stat--cities">
            <strong>{signals.cities}</strong>
            <span>cities</span>
          </p>
          <p className="cp-substat">Across {signals.countries} countries</p>
        </aside>
      </section>

      <section className="cp-feedrow" aria-label="Live feed">
        <span className="cp-feed-label"><i />Live feed</span>
        <ul className="cp-feed">
          {liveFeed.map(({ place, text, ago }) => (
            <li key={place}>
              <button type="button" className="cp-feed-item">
                <strong>{place}</strong>
                <span>{text}</span>
                <small>{ago}</small>
                <ChevronRight />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
