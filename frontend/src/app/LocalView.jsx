import { Activity, AirVent, ArrowUpRight, Car, LocateFixed, Thermometer, Users, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from './useEvents.js'
import LocalMap from './LocalMap.jsx'
import LocationSelector from './LocationSelector.jsx'
import Sparkline from './Sparkline.jsx'
import { useEvents, useHealth } from './useEvents.js'
import { nameOf, toneOf } from '../lib/severity.js'
import { formatAgo } from '../lib/time.js'

const TILE_ICONS = { air: AirVent, temp: Thermometer, car: Car, zap: Zap, users: Users }

/** Best-effort congestion % from whichever traffic adapter produced `e` (they don't share a raw shape). */
function trafficReading(e) {
  if (!e) return { value: '—', sub: 'No data yet' }
  if (Number.isFinite(e.raw?.congestionPct)) return { value: `${Math.round(e.raw.congestionPct)}%`, sub: e.raw.road ?? e.title }
  if (Number.isFinite(e.raw?.current_speed_kmh) && Number.isFinite(e.raw?.free_flow_speed_kmh)) {
    const slowdownPct = Math.round((1 - e.raw.current_speed_kmh / Math.max(1, e.raw.free_flow_speed_kmh)) * 100)
    return { value: `${Math.max(0, slowdownPct)}%`, sub: e.title }
  }
  return { value: nameOf(e.severity), sub: e.title }
}

export default function LocalView({ location, onLocationChange, onSelectEvent }) {
  const { events, radiusKm, lastUpdated } = useEvents({ scope: 'local', lat: location.lat, lng: location.lng })
  const health = useHealth()
  const [wards, setWards] = useState(null)
  const [layers, setLayers] = useState(() => { try { return JSON.parse(localStorage.getItem('citypulse-local-layers')) || { wards: true, aqi_station: true, waterlogging_risk: true, flood_forecast: true, rain_forecast: true, news: false, exposure: false, traffic: true, civic: true, pois: false, simulated: true } } catch { return {} } })
  useEffect(() => { fetch(`${API_BASE}/api/wards`).then((r) => r.ok ? r.json() : null).then(setWards).catch(() => {}) }, [])
  useEffect(() => { localStorage.setItem('citypulse-local-layers', JSON.stringify(layers)) }, [layers])
  const scoredWards = useMemo(() => wards ? { ...wards, features: wards.features.map((f) => { const relevant = events.filter((e) => e.ward_id === f.properties.ward_id); const hazard = relevant.reduce((n, e) => Math.max(n, e.severity * 20), 0); const exposure = f.properties.facility_count || 0; const impact = Math.round(hazard * Math.max(1, exposure) / 10); return { ...f, properties: { ...f.properties, hazard_score: hazard, exposure_score: exposure, impact, score: Math.min(100, Math.round(hazard * 0.7 + Math.min(exposure, 30))), confidence_score: relevant.some((e) => e.tag === 'SIMULATED') ? 55 : 75 } } }) } : null, [wards, events])
  const chips = [['wards','Wards'],['aqi_station','AQI Stations'],['waterlogging_risk','Waterlogging Risk'],['flood_forecast','Flood Forecast'],['rain_forecast','Rain Forecast'],['news','News'],['exposure','Exposure'],['traffic','Traffic'],['civic','Civic Complaints'],['industrial_context','Industrial'],['historical_baseline','Baseline'],['pois','POIs'],['simulated','Simulated']]

  // Everything below is derived from `events` (this location's real, backend-scoped feed) and
  // `location` - no more hardcoded Amer/Kunda copy left over from the original design mock-up.
  const nonSimCount = events.filter((e) => e.tag !== 'SIMULATED').length
  const active = events.some((e) => e.severity >= 3)
  const status = events.length === 0 ? 'Quiet' : active ? 'Active' : 'Quiet'
  const headline = `${location.label} is ${status.toLowerCase()}.`
  const summary = events.length === 0
    ? `Waiting for ingested local signals near ${location.label}.`
    : nonSimCount > 0
      ? `${nonSimCount} ingested local signal${nonSimCount === 1 ? '' : 's'} visible near ${location.label}. Rain and reported hotspots may have a possible link; this is not a confirmed incident.`
      : `${events.length} simulated demo signal${events.length === 1 ? '' : 's'} visible near ${location.label}. Not independently confirmed.`
  const updated = lastUpdated ? `updated ${formatAgo(lastUpdated.toISOString())}` : 'waiting for first update'

  const latestOf = (pred) => events.find(pred)
  const aqiEvent = latestOf((e) => e.type === 'air_quality')
  const weatherEvent = latestOf((e) => e.type === 'weather')
  const trafficEvent = latestOf((e) => e.type === 'traffic')
  const crowdEvent = latestOf((e) => e.type === 'crowd')
  const incidentEvents = events.filter((e) => e.type === 'civic' || e.type === 'alert')
  const traffic = trafficReading(trafficEvent)

  const liveTiles = [
    {
      id: 'aqi', icon: 'air', tone: aqiEvent ? toneOf(aqiEvent.severity) : 'muted',
      value: Number.isFinite(aqiEvent?.raw?.us_aqi) ? String(Math.round(aqiEvent.raw.us_aqi)) : '—',
      unit: Number.isFinite(aqiEvent?.raw?.us_aqi) ? 'AQI' : undefined,
      label: 'Air quality', sub: aqiEvent ? nameOf(aqiEvent.severity) : 'No data yet',
    },
    {
      id: 'temp', icon: 'temp', tone: weatherEvent ? toneOf(weatherEvent.severity) : 'muted',
      value: Number.isFinite(weatherEvent?.raw?.temperature_c) ? `${Math.round(weatherEvent.raw.temperature_c)}°` : '—',
      unit: Number.isFinite(weatherEvent?.raw?.temperature_c) ? 'C' : undefined,
      label: 'Temperature', sub: weatherEvent?.title ?? 'No data yet',
    },
    {
      id: 'traffic', icon: 'car', tone: trafficEvent ? toneOf(trafficEvent.severity) : 'muted',
      value: traffic.value, label: 'Traffic', sub: traffic.sub,
    },
    {
      id: 'incidents', icon: 'zap', tone: incidentEvents.length ? toneOf(Math.max(...incidentEvents.map((e) => e.severity))) : 'muted',
      value: String(incidentEvents.length), unit: incidentEvents.length ? 'active' : undefined,
      label: 'Incidents', sub: incidentEvents[0]?.title ?? 'No open incidents',
    },
    {
      id: 'crowd', icon: 'users', tone: crowdEvent ? toneOf(crowdEvent.severity) : 'muted',
      value: Number.isFinite(crowdEvent?.raw?.capacityPct) ? `${Math.round(crowdEvent.raw.capacityPct)}%` : (crowdEvent ? nameOf(crowdEvent.severity) : '—'),
      label: 'Crowd level', sub: crowdEvent?.title ?? 'No data yet',
    },
  ]

  const liveCorrelation = useMemo(() => {
    const rain = events.find((e) => e.type === 'weather')
    const water = events.find((e) => e.layer === 'waterlogging_risk')
    const aqi = events.find((e) => e.layer === 'aqi_station' && Number(e.raw?.model_gap) > 0)
    if (rain && water) return { title: 'Rain and a reported hotspot may be linked', body: `Open-Meteo weather and the ${water.title.replace('Possible waterlogging risk: ', '')} media-reported hotspot co-occur in this view. This is a possible link, not confirmation.`, confidence: water.raw?.confidence === 'reported' ? 2 : 1, note: 'Drawn from ingested forecast and media-reported signals.' }
    if (aqi) return { title: 'Measured and modelled AQI can be compared', body: `${aqi.raw.station} differs from the local model by ${aqi.raw.model_gap} AQI points. This is a confidence comparison, not an attribution.`, confidence: aqi.raw.confidence === 'low' ? 1 : 2, note: 'Drawn from WAQI station and Open-Meteo model values.' }
    return { title: `No strong correlations near ${location.label} yet.`, body: `Once enough local signals are ingested near ${location.label}, possible links between them will surface here.`, confidence: 0, note: 'Waiting for more local signals.' }
  }, [events, location.label])

  const feedItems = events.slice(0, 6).map((e) => ({ id: e.id, tone: toneOf(e.severity), title: e.title, detail: `${e.source}${e.tag === 'SIMULATED' ? ' · simulated' : ''}`, ago: formatAgo(e.timestamp) }))

  return (
    <div className="cp-container">
      <section className="cp-hero cp-hero--local">
        <div>
          <p className="cp-eyebrow">Area pulse / {location.region}</p>
          <h1 className="cp-h1">{location.label}</h1>
        </div>
        <button type="button" className="cp-recenter">
          <LocateFixed />
          Recenter
        </button>
      </section>

      <LocationSelector location={location} onChange={onLocationChange} />

      <section className="cp-card cp-pulse" aria-label="Area pulse">
        <div className="cp-badge">
          <div className="cp-badge-core">
            <Activity />
            <span>{status}</span>
          </div>
        </div>
        <div className="cp-pulse-copy">
          <p className="cp-label">Area pulse</p>
          <h2>{headline}</h2>
          <p>{summary}</p>
        </div>
        <p className="cp-updated"><i />{updated}</p>
      </section>

      <section className="cp-tiles" aria-label="Key readings">
        {liveTiles.map(({ id, icon, tone, value, unit, label, sub }) => {
          const Icon = TILE_ICONS[icon]
          return (
            <article key={id} className="cp-card cp-tile">
              <div className="cp-tile-top">
                <span className={`cp-tile-icon cp-tone--${tone}`}><Icon /></span>
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
              <h3 className="cp-card-title">Activity around {location.label}</h3>
            </div>
          </header>
          <div className="cp-layerchips" aria-label="Map layers">{chips.map(([id,label]) => <button key={id} type="button" className="cp-chip" aria-pressed={layers[id] !== false} onClick={() => setLayers((old) => ({ ...old, [id]: old[id] === false }))}><i className={`cp-source-dot ${id === 'simulated' ? 'is-mock' : ''}`} />{label} <small>{id === 'wards' ? (wards?.features.length || 0) : events.filter(e => id === 'simulated' ? e.tag === 'SIMULATED' : e.layer === id || e.type === id).length}</small></button>)}</div>
          <LocalMap center={location} events={events} wards={scoredWards} layers={layers} radiusKm={radiusKm} onSelectEvent={onSelectEvent} />
        </article>

        <div className="cp-side">
          <article className="cp-card cp-corr">
            <header className="cp-card-head">
              <p className="cp-label">Possible correlation</p>
              <button type="button" className="cp-help" aria-label="How is this calculated?">?</button>
            </header>
            <h3 className="cp-corr-title">{liveCorrelation.title}</h3>
            <p className="cp-corr-body">{liveCorrelation.body}</p>
            <div className="cp-conf" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <i key={i} className={i < liveCorrelation.confidence ? 'is-on' : undefined} />
              ))}
            </div>
            <p className="cp-conf-note">{liveCorrelation.note}</p>
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
            {feedItems.length === 0 ? (
              <p className="cp-panel-empty">No recent signals near {location.label}.</p>
            ) : (
              <ul className="cp-incident-list">
                {feedItems.map(({ id, tone, title, detail, ago }) => (
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
            )}
          </article>
        </div>
      </section>
      <section className="cp-source-strip" aria-label="Source status"><strong>Sources</strong>{[['weather','Open-Meteo weather'],['aq','Open-Meteo AQ'],['waqi','WAQI ground stations'],['gdelt','GDELT media'],['waterlogging','Rain-risk model'],['flood','GloFAS flood forecast'],['exposure','OSM exposure'],['historical','Open-Meteo archive'],['tomtom','TomTom traffic'],['context','Static context'],['amer','Amer simulated']].map(([key,name]) => <span key={key} title={`Status: ${health.feeds?.[key] || 'checking'}`}><i className={health.feeds?.[key] === 'sim' || health.feeds?.[key] === 'mock' ? 'is-mock' : health.feeds?.[key] === 'down' || health.feeds?.[key] === 'disabled' ? 'is-down' : ''} />{name} · {health.feeds?.[key] || 'checking'}</span>)}<small>{health.lastUpdated ? `updated ${health.lastUpdated.toLocaleTimeString()}` : 'Background cached'}</small></section>
    </div>
  )
}
