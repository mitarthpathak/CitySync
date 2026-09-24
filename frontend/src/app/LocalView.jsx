import { Activity, AirVent, ArrowUpRight, Car, LocateFixed, Thermometer, Users, Zap } from 'lucide-react'
import LocalMap from './LocalMap.jsx'
import Sparkline from './Sparkline.jsx'
import { area, correlation, incidents, tiles } from './data.js'

const TILE_ICONS = { air: AirVent, temp: Thermometer, car: Car, zap: Zap, users: Users }

export default function LocalView() {
  return (
    <div className="cp-container">
      <section className="cp-hero cp-hero--local">
        <div>
          <p className="cp-eyebrow">{area.eyebrow}</p>
          <h1 className="cp-h1">{area.name}</h1>
        </div>
        <button type="button" className="cp-recenter">
          <LocateFixed />
          Recenter
        </button>
      </section>

      <section className="cp-card cp-pulse" aria-label="Area pulse">
        <div className="cp-badge">
          <div className="cp-badge-core">
            <Activity />
            <span>{area.status}</span>
          </div>
        </div>
        <div className="cp-pulse-copy">
          <p className="cp-label">Area pulse</p>
          <h2>{area.headline}</h2>
          <p>{area.summary}</p>
        </div>
        <p className="cp-updated"><i />{area.updated}</p>
      </section>

      <section className="cp-tiles" aria-label="Key readings">
        {tiles.map(({ id, icon, tone, delta, deltaTone, value, unit, label, sub }) => {
          const Icon = TILE_ICONS[icon]
          return (
            <article key={id} className="cp-card cp-tile">
              <div className="cp-tile-top">
                <span className={`cp-tile-icon cp-tone--${tone}`}><Icon /></span>
                <span className={`cp-delta cp-tone--${deltaTone}`}>{delta}</span>
              </div>
              <p className="cp-tile-value">
                {value}
                {unit && <small>{unit}</small>}
              </p>
              <h3>{label}</h3>
              <p className="cp-tile-sub">{sub}</p>
              <Sparkline tone={tone} />
            </article>
          )
        })}
      </section>

      <section className="cp-local-grid">
        <article className="cp-card cp-mapcard">
          <header className="cp-card-head">
            <div>
              <p className="cp-label">Live map</p>
              <h3 className="cp-card-title">Activity around Amer</h3>
            </div>
            <span className="cp-label cp-label--sm">Simulated map</span>
          </header>
          <LocalMap />
        </article>

        <div className="cp-side">
          <article className="cp-card cp-corr">
            <header className="cp-card-head">
              <p className="cp-label">Possible correlation</p>
              <button type="button" className="cp-help" aria-label="How is this calculated?">?</button>
            </header>
            <h3 className="cp-corr-title">{correlation.title}</h3>
            <p className="cp-corr-body">{correlation.body}</p>
            <div className="cp-conf" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <i key={i} className={i < correlation.confidence ? 'is-on' : undefined} />
              ))}
            </div>
            <p className="cp-conf-note">{correlation.note}</p>
          </article>

          <article className="cp-card cp-incidents">
            <header className="cp-card-head">
              <div>
                <p className="cp-label">Incident feed</p>
                <h3 className="cp-card-title">Recent signals</h3>
              </div>
              <button type="button" className="cp-viewall">
                View all
                <ArrowUpRight />
              </button>
            </header>
            <ul className="cp-incident-list">
              {incidents.map(({ id, tone, title, detail, ago }) => (
                <li key={id}>
                  <i className={`cp-dot cp-dot--${tone}`} />
                  <div>
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </div>
                  <small>{ago}</small>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </div>
  )
}
