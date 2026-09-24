import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Radio } from 'lucide-react'
import { useEvents, useHealth } from './useEvents.js'
import { LAYERS, LAYER_BY_ID, LAYER_IDS, TAGS, layerOf, layerStatuses, tagOf } from '../lib/layers.js'
import { SEVERITY_COLORS, SEVERITY_NAMES } from '../lib/severity.js'
import { formatAgo } from '../lib/time.js'

// The globe (react-globe.gl + three.js) is big and only this screen needs it, so it loads on demand.
const GlobeView = lazy(() => import('./GlobeView.jsx'))

const PREFS_KEY = 'cp.globeLayers'
const TICKER_SIZE = 16
const STATUS_TEXT = { live: 'live', mock: 'mock data (source down)', down: 'source down', none: 'no source yet' }

function readLayerPrefs() {
  const all = Object.fromEntries(LAYER_IDS.map((id) => [id, true]))
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    if (stored && typeof stored === 'object') {
      for (const id of LAYER_IDS) if (typeof stored[id] === 'boolean') all[id] = stored[id]
    }
  } catch {
    /* private mode / corrupt value: defaults */
  }
  return all
}

/** A small CSS-drawn sample of how the layer looks on the globe (see GlobeView's textures). */
const Glyph = ({ kind }) => <span className={`cp-glyph cp-glyph--${kind}`} aria-hidden="true" />

export default function GlobalView({ active = true, onSelectEvent }) {
  const { events: allEvents, loading, error, lastUpdated } = useEvents({ scope: 'global' })
  const health = useHealth()

  const [layers, setLayers] = useState(readLayerPrefs)
  const toggleLayer = (id) => setLayers((current) => ({ ...current, [id]: !current[id] }))
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(layers)) } catch { /* fine */ }
  }, [layers])

  const counts = useMemo(() => {
    const c = Object.fromEntries(LAYER_IDS.map((id) => [id, 0]))
    for (const e of allEvents) c[layerOf(e)] += 1
    return c
  }, [allEvents])
  const statuses = useMemo(() => layerStatuses(health.sources), [health.sources])
  const visible = useMemo(() => allEvents.filter((e) => layers[layerOf(e)]), [allEvents, layers])

  // Ticker: newest events across enabled layers, interleaved one layer at a time so a chatty
  // source (the simulator stamps every event "now") can't crowd out everything else.
  const ticker = useMemo(() => {
    const byLayer = new Map()
    for (const e of [...visible].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))) {
      const id = layerOf(e)
      if (!byLayer.has(id)) byLayer.set(id, [])
      byLayer.get(id).push(e)
    }
    const queues = LAYER_IDS.map((id) => byLayer.get(id) ?? []).filter((q) => q.length)
    const out = []
    while (out.length < TICKER_SIZE && queues.some((q) => q.length)) {
      for (const q of queues) if (q.length && out.length < TICKER_SIZE) out.push(q.shift())
    }
    return out
  }, [visible])

  // Real numbers only (this rail used to show placeholder figures).
  const stats = useMemo(() => {
    const cities = new Set()
    const countries = new Set()
    for (const e of allEvents) {
      if (e.raw?.city) cities.add(e.raw.city)
      if (e.raw?.country) countries.add(e.raw.country)
    }
    return {
      high: visible.filter((e) => e.severity >= 4 && tagOf(e) !== 'SIMULATED').length,
      alerts: counts.alerts,
      cities: cities.size,
      countries: countries.size,
    }
  }, [allEvents, visible, counts.alerts])
  const realSources = health.sources ? Object.values(health.sources).filter((s) => s.status !== 'disabled' && !s.simulated).length : null

  // Ticker click: open the panel AND fly the globe to it.
  const [focus, setFocus] = useState(null)
  const selectFromTicker = useCallback((event) => {
    setFocus({ event, at: Date.now() })
    onSelectEvent?.(event)
  }, [onSelectEvent])

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
            {LAYERS.map(({ id, label, Icon, hint }) => {
              const status = statuses[id] ?? 'none'
              return (
                <button
                  key={id}
                  type="button"
                  className="cp-chip cp-chip--layer"
                  aria-pressed={layers[id]}
                  onClick={() => toggleLayer(id)}
                  title={`${hint} Source: ${STATUS_TEXT[status]}.`}
                >
                  <Icon />
                  <span className="cp-chip-label">{label}</span>
                  <span className="cp-chip-count">{counts[id]}</span>
                  <i className="cp-chip-status" data-status={status} aria-label={`source ${STATUS_TEXT[status]}`} />
                </button>
              )
            })}
          </div>

          <details className="cp-legendbox">
            <summary><ChevronRight aria-hidden="true" />Legend</summary>
            <ul className="cp-legend cp-legend--glyphs">
              {LAYERS.map(({ id, label, glyph }) => (
                <li key={id}><Glyph kind={glyph} />{label}</li>
              ))}
              <li><Glyph kind="cluster" />Crowded area (zoom in)</li>
            </ul>
            <p className="cp-label cp-legend-sub">Severity</p>
            <ul className="cp-legend cp-legend--ramp">
              {[1, 2, 3, 4, 5].map((s) => (
                <li key={s}><i className="cp-dot" style={{ background: SEVERITY_COLORS[s] }} />{s} · {SEVERITY_NAMES[s]}</li>
              ))}
            </ul>
            <p className="cp-legend-note">
              <b>MEDIA</b> = news mentions, not confirmed. <b>SIMULATED</b> = generated / mock data. <b>STATIC</b> = real but not live.
            </p>
          </details>
        </aside>

        <div className="cp-globe-panel">
          <Suspense fallback={null}>
            <GlobeView
              active={active}
              onSelectEvent={onSelectEvent}
              events={visible}
              totalCount={allEvents.length}
              loading={loading}
              error={error}
              lastUpdated={lastUpdated}
              focus={focus}
            />
          </Suspense>
          <span className="cp-coord cp-coord-n" aria-hidden="true">N 42°</span>
          <span className="cp-coord cp-coord-e" aria-hidden="true">E 74°</span>
        </div>

        <aside className="cp-rail cp-rail-right">
          <p className="cp-label">Live sources</p>
          <p className="cp-stat">
            <strong>{health.liveSources ?? '–'}</strong>
            <span>/ {realSources ?? '–'}</span>
          </p>
          <p className="cp-substat">real feeds reporting now</p>

          <p className="cp-label cp-label-coverage">High severity</p>
          <p className="cp-stat">
            <strong>{stats.high}</strong>
            <span>events</span>
          </p>
          <p className="cp-substat">severity 4–5 on visible layers · {stats.alerts} official alert{stats.alerts === 1 ? '' : 's'}</p>

          <p className="cp-label cp-label-coverage2">Coverage</p>
          <p className="cp-stat cp-stat--cities">
            <strong>{stats.cities}</strong>
            <span>cities</span>
          </p>
          <p className="cp-substat">monitored across {stats.countries} countries</p>
        </aside>
      </section>

      <section className="cp-feedrow" aria-label="Live feed">
        <span className="cp-feed-label"><i />Live feed</span>
        <div className="cp-ticker">
          {ticker.length === 0 ? (
            <p className="cp-ticker-empty">{loading ? 'Loading events…' : 'No events on the enabled layers.'}</p>
          ) : (
            // Rendered twice for a seamless marquee loop; the copy is hidden from assistive tech.
            <div className="cp-ticker-track">
              {[0, 1].map((copy) => (
                <ul key={copy} className="cp-feed" aria-hidden={copy === 1 || undefined}>
                  {ticker.map((e) => {
                    const badge = TAGS[tagOf(e)].badge
                    return (
                      <li key={e.id}>
                        <button type="button" className="cp-feed-item" onClick={() => selectFromTicker(e)} tabIndex={copy === 1 ? -1 : undefined}>
                          <i className="cp-dot" style={{ background: SEVERITY_COLORS[e.severity] }} />
                          <em className="cp-feed-layer">{LAYER_BY_ID[layerOf(e)]?.label}</em>
                          <strong>{e.title}</strong>
                          {badge && <b className="cp-feed-badge" data-tag={tagOf(e)}>{badge}</b>}
                          <small>{formatAgo(e.timestamp)}</small>
                          <ChevronRight />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
