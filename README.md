# CitySync backend

Node.js + Express (plain JavaScript, CommonJS) API that fuses several civic data feeds into one normalized event stream, with a global vs local (Amer, Jaipur) geo-filter. No API keys, no accounts.

## Run

Requires Node 18 or newer (uses the built-in `fetch`).

```bash
npm install
npm start
```

The API is now on http://localhost:3000. Try:

```bash
curl "http://localhost:3000/events"               # everything (global)
curl "http://localhost:3000/events?scope=local"   # within 15 km of Amer
curl "http://localhost:3000/health"
```

Both `PORT` and `USE_MOCK` are optional. To change them, copy `.env.example` to `.env` or set them in the shell.

## Offline / demo mode

```bash
# any OS, any shell
npm run start:mock

# macOS / Linux / Git Bash
USE_MOCK=true npm start

# Windows PowerShell
$env:USE_MOCK="true"; npm start

# Windows cmd
set USE_MOCK=true && npm start
```

Or put `USE_MOCK=true` in `.env`. In this mode the server serves only `events.json` and makes no network calls. The startup log confirms it: `[mode] USE_MOCK=true - serving events.json only`.

## Endpoints

Both endpoints answer from an in-memory cache that a background scheduler keeps fresh. **No HTTP request ever triggers an upstream call** (the Amer simulator is generated locally per request; it has no upstream).

### `GET /events?scope=global|local&layers=a,b,c`

Returns a JSON array of normalized events, newest first. `scope` defaults to `global`. `local` keeps events within 15 km (haversine) of Amer (26.9855, 75.8513). `layers` (optional) keeps only those layers, e.g. `layers=news,alerts,weather`. Valid layers: `earthquakes, weather, air_quality, news, alerts, climate, anomaly, simulated`. An unknown `scope` or layer gets a `400`.

### `GET /health`

```json
{
  "status": "ok", "mode": "live", "count": 385, "liveSources": 6,
  "feeds":   { "usgs": "live", "weather": "mock", "gdelt": "live", "amer": "sim", "gee": "disabled", "...": "..." },
  "layers":  { "earthquakes": 243, "alerts": 28, "air_quality": 49, "...": 0 },
  "sources": {
    "sachet": { "label": "NDMA SACHET official alerts", "layer": "alerts", "status": "live", "stale": false,
                "count": 28, "lastSuccess": "2026-09-24T20:59:53Z", "lastError": null, "refreshMs": 900000,
                "nextRefreshAt": "...", "detail": { "rssItems": 99, "active": 63, "expired": 34 } }
  }
}
```

`feeds` keeps its original shape (key → status). `sources` is the detailed report. `liveSources` counts real (non-simulated) sources that are currently live.

| status     | meaning |
| ---------- | ------- |
| `live`     | last refresh succeeded. `stale: true` = the latest refresh failed but the last good data (younger than max(1 h, 2 × refresh interval)) is still served |
| `mock`     | upstream down (or `USE_MOCK=true`); its slice of `events.json` is served, tagged SIMULATED |
| `down`     | upstream down and `events.json` has nothing for it |
| `disabled` | switched off, or a planned stub (`connectors/`) |
| `sim`      | (`feeds` only, legacy) the built-in Amer simulator |

## Event schema

Every source normalizes into this shape. The last three fields were added; the original ten keep their meaning.

```js
{
  id: string,
  type: "earthquake" | "weather" | "air_quality" | "traffic" | "crowd" | "civic" | "event"
      | "news" | "alert" | "climate" | "anomaly",
  title: string,
  lat: number, lng: number,
  timestamp: string,   // ISO 8601
  severity: number,    // 1 (info) .. 5 (critical)
  source: string,
  isSimulated: boolean,
  raw: object,         // source-specific extras
  layer: "earthquakes" | "weather" | "air_quality" | "news" | "alerts" | "climate" | "anomaly" | "simulated",
  tag: "REAL_LIVE" | "REAL_STATIC" | "MEDIA_REPORTED" | "ESTIMATED" | "SIMULATED",
  sourceUrl: string | null
}
```

`layer`/`tag` default from `type` for older data (`lib/event.js` `withDefaults`). Anything `isSimulated` is always tagged `SIMULATED`, whatever else it claims.

## Sources

| key | source | layer / tag | refresh | severity rule |
| --- | --- | --- | --- | --- |
| usgs | USGS all-day GeoJSON | earthquakes / REAL_LIVE | 1 min | magnitude: <3 → 2, 3–4 → 3, 4–5 → 4, ≥5 → 5 |
| weather | Open-Meteo forecast, Amer | weather / REAL_LIVE | 10 min | max of weather code and heat (≥35 °C 3, ≥40 °C 4) |
| aq | Open-Meteo Air Quality, Amer | air_quality / REAL_LIVE | 10 min | US AQI ≤50 1, ≤100 2, ≤150 3, ≤200 4, else 5 |
| cityWeather | Open-Meteo forecast, **48-city world grid in ONE request** (`config/world-cities.js`) | weather / REAL_LIVE | 10 min | same as `weather` |
| cityAq | Open-Meteo Air Quality, same grid, ONE request | air_quality / REAL_LIVE | 10 min | same as `aq` |
| gdelt | GDELT DOC 2.0 artlist, configurable queries (`lib/config.js` / `GDELT_QUERIES`) | news / MEDIA_REPORTED | 15 min | article volume + recency only, **capped at 3** |
| sachet | NDMA SACHET RSS + CAP 1.2 XML (India) | alerts / REAL_LIVE | 15 min | CAP Extreme → 5, anything else issued → 4 |
| nasaPower | NASA POWER daily point API (T2M, T2M_MAX, PRECTOTCORR), same grid | climate / REAL_STATIC | 24 h | max ≥35 °C 3, ≥40 °C 4; rain ≥20 mm 2, ≥50 3, ≥100 4 |
| anomaly | Open-Meteo archive (ERA5): latest archived day vs same ±3-day window over the previous 10 years | anomaly / REAL_STATIC | 24 h | only if \|Δ\| ≥ 3 °C and \|z\| ≥ 1.75; z ≥ 2.5 → 3, ≥ 3.5 → 4 |
| amer | built-in generator | simulated / SIMULATED | per request | see `adapters/amerSim.js` |
| gee, mosdac, bhuvan, iudx | **planned stubs** in `connectors/`, no network code | — | disabled | — |

Honesty rules the adapters follow:

- **GDELT**: artlist has no coordinates (only the *publisher's* country). An article is placed only when its headline names a place in `lib/gazetteer.js` (city > region > country; ambiguous names like Georgia or Punjab excluded); otherwise it is **dropped**, never guessed. Articles are clustered per (topic, place) into one "Media mentions" event. Requests go through one serialized queue spaced `GDELT_MIN_GAP_MS` (10 s) apart; on a 429 the cycle stops and the next resumes where it stopped; each query's last result is reused for up to 1 h.
- **SACHET**: polygon files are not public (403), so alerts are placed at the centroid of the state named in the alert (area text, sender, issuing office) or at the issuing IMD office; unplaceable alerts are dropped. Expired, cancelled and non-`Actual` alerts are dropped. Alerts are grouped per (place, hazard) so one state doesn't stack 40 markers.
- **Anomalies** compare reanalysis with reanalysis (same dataset) on purpose; comparing a live forecast with reanalysis would mostly measure model bias.

## Failure handling

- Every source is an independent adapter on its own timer (`lib/normalize.js`). `Promise.allSettled` + per-source try/catch: a failing, slow or hanging source never blocks or sinks the others, and the server never exits because of one.
- At startup every source first serves its `events.json` slice, then fetches live, so the globe is never blank during warm-up.
- A failed refresh keeps serving the last good data for a grace period (flagged `stale`), then falls back to mock. Failed sources retry after 2 min (GDELT: 10 min, since retrying fast only extends its rate-limit penalty).
- Mock / backfilled events are never presented as real: forced `isSimulated: true`, tag `SIMULATED`, and a `(mock)` source suffix.

## Mock file

`events.json` lives in the project root. Whatever it says, its events are always served as `isSimulated: true`, tag `SIMULATED`, with a `(mock)` source suffix. Slices are matched by `type`: `earthquake` → usgs, `weather` → weather, `air_quality` → aq, `news` → gdelt, `alert` → sachet, `climate` → nasaPower, `anomaly` → anomaly, everything else → amer.

## Layout

```
server.js              Express app, CORS, /events (+layers filter) and /health
config/
  world-cities.js      the 48-city world grid (edit freely)
adapters/              one independent module per source
  usgs.js  weather.js  airQuality.js  amerSim.js      (original four)
  cityGrid.js          world-grid weather + AQ, one request each
  gdelt.js             GDELT news, rate-limited queue
  sachet.js            NDMA SACHET RSS + CAP parser
  nasaPower.js         NASA POWER daily climate (Tier 2)
  anomaly.js           Open-Meteo archive anomalies (Tier 2)
connectors/            planned, NOT integrated: GEE, MOSDAC, Bhuvan, IUDX stubs
lib/
  normalize.js         background scheduler, per-source cache + status, fuse/scope/layers
  sources.js           source registry (key, layer, refresh interval, mock slice)
  event.js             schema: validation, builder, layer/tag defaults
  gazetteer.js         place names -> coordinates (GDELT headlines, SACHET states)
  mock.js              events.json loader (tags everything as simulated)
  http.js              fetch wrappers (JSON / text) with timeouts + readable errors
  geo.js  time.js  config.js
events.json            mock data
```

## Frontend

The web app lives in `frontend/` (Vite + React). It is a separate project with its own `package.json`:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

See `frontend/README.md` for the routes, the `GlobeView` component (the 3D globe, fed by this API), and what is still demo data.
