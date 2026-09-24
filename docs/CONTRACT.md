# CitySync shared contract (FROZEN: do not edit on feature branches)

Adapted for this repo's real stack: **JavaScript + Express** (backend, CommonJS,
`npm`) and **Vite + React** (frontend, plain JSX, no TypeScript). There is no
Next.js `app/` router and no `backend/` prefix directory — backend code lives at
the repo root. Wherever an earlier draft of this contract said `.ts`/`.tsx`,
`next/dynamic`, `'use client'`, or `pnpm`, read it as the row in the mapping
table below instead.

## Stack mapping (read this first)

| Generic contract concept | This repo's actual path / mechanism |
|---|---|
| `backend/` prefix | none — backend files live at the repo root (`server.js`, `lib/`, `adapters/`, `routes/`) |
| `backend/server.js` | `server.js` |
| `backend/lib/cache.js` | `lib/cache.js` |
| `backend/lib/envelope.js` | `lib/envelope.js` |
| `backend/routes/local.js` | `routes/local.js` |
| `backend/routes/globe.js` | `routes/globe.js` |
| `backend/adapters/local/**` | `adapters/local/**` (existing `adapters/*.js` — usgs, weather, airQuality, amerSim — stay flat at that level and are frozen; new local-only adapters go in this new subfolder) |
| `backend/adapters/globe/**` | `adapters/globe/**` (new subfolder, same reasoning) |
| `backend/{jobs,config,data,scripts}/local/**` | `{jobs,config,data,scripts}/local/**` (created at the repo root the first time feat/local needs one) |
| `backend/{jobs,config,data,scripts}/globe/**` | `{jobs,config,data,scripts}/globe/**` |
| `frontend/lib/contract.ts` | `frontend/src/lib/contract.js` — exports the `TAGS` constant and an `envelope()`/`unwrapEnvelope()` helper, with JSDoc `@typedef`s standing in for the TS types |
| `frontend/components/shared/**` | `frontend/src/shared/**` (e.g. `TagBadge.jsx`) |
| `frontend/components/local/**` | `frontend/src/local/**` — **not** `frontend/src/app/LocalView.jsx`, which already exists and is the current shipped Local dashboard view (Leaflet map + event panel). The contract's `LocalView()` is a new, separate component; see "Naming collision" below |
| `frontend/components/globe/**` | `frontend/src/globe/**` — **not** `frontend/src/app/GlobeView.jsx`, which already exists and is the current 3D globe canvas widget. Same collision, see below |
| `frontend/app/dashboard/page.tsx` | `frontend/src/App.jsx` (route switch: `/`, `/app`, `/app/local`) together with `frontend/src/app/AppShell.jsx` (the actual Global/Local dashboard container, crossfade + shared state) |
| `next/dynamic` + `'use client'` | `React.lazy` + `<Suspense>` — already exactly how `App.jsx` loads `AppShell.jsx` (`'use client'` has no Vite/CSR equivalent; there's nothing to do there) |
| `pnpm` | `npm` — both `package-lock.json` files are npm's |
| Ownership doc dirs `docs/local/**`, `docs/globe/**` | unchanged, created at the repo root |

### Naming collision, called out explicitly

This project already ships a dashboard with views also called "Global" and
"Local" (`frontend/src/app/GlobalView.jsx`, `LocalView.jsx`, plus the
`GlobeView.jsx` 3D-canvas widget and `LocalMap.jsx` Leaflet widget they use
internally). Those are the **existing shipped product** and are not part of
this contract's scope.

This contract's `LocalView()` / `GlobeView({ onOpenLocal })` are a **new,
separate** pair of components — the integration surface for the new
honesty-tagged, cache-backed data features feat/local and feat/globe are
building. They live under the new `frontend/src/local/` and
`frontend/src/globe/` folders precisely so they don't collide with, or get
confused with, the existing same-named files under `frontend/src/app/`. A
lead-owned demo harness (`frontend/src/ContractDemo.jsx`, routed at
`/contract-demo`) toggles between them so the pipeline is exercisable without
touching the real dashboard. Wiring these into the real `AppShell` is a
future, explicit decision — not part of this scaffolding step.

## Ownership

- `feat/local` owns: `adapters/local/**`, `jobs/local/**`, `config/local/**`, `data/local/**`, `scripts/local/**`, `routes/local.js`, `frontend/src/local/**`, `docs/local/**`
- `feat/globe` owns: the same paths with `globe` in place of `local` (`adapters/globe/**`, `routes/globe.js`, `frontend/src/globe/**`, `docs/globe/**`, ...)
- Frozen (lead only): this file, `server.js`, `lib/cache.js`, `lib/envelope.js`, `frontend/src/lib/contract.js`, `frontend/src/shared/**`, `frontend/src/App.jsx`, `frontend/src/app/AppShell.jsx`, and the **existing** adapters — `adapters/usgs.js`, `adapters/weather.js`, `adapters/airQuality.js`, `adapters/amerSim.js`. Import them; never edit them. Need a change in a frozen file? Ask the lead.
- Integration points only: `LocalView()` (from `frontend/src/local/LocalView.jsx`) and `GlobeView({ onOpenLocal })` (from `frontend/src/globe/GlobeView.jsx`).

## Honesty tags

`REAL_LIVE | REAL_STATIC | MEDIA_REPORTED | ESTIMATED | SIMULATED`. Every datum
carries one. UI shows a `TagBadge` (`frontend/src/shared/TagBadge.jsx`).
`SIMULATED` is always visible. Never disguise synthetic data as real.

## API envelope (every response)

```
{ ok, generatedAt (ISO), source, tag, stale, confidence (0..1), data, error? }
```

Built with `lib/envelope.js`'s `envelope()` helper on the backend, and read
with `frontend/src/lib/contract.js`'s `unwrapEnvelope()` on the frontend.

## Pipeline

external API -> scheduled job -> cache (`lib/cache.js`) -> route reads cache
ONLY. Never call an external API per request. A failing source is isolated:
serve the last cache entry with `stale: true` and lower `confidence`;
everything else keeps working.

`lib/cache.js` already holds this project's request-time promise cache
(`cached()`), used by the existing frozen adapters — that function is
untouched. The scheduled-job pattern above is a second, additive pair of
exports on the same frozen file: `writeCache(key, envelope)` (called only by a
scheduled job) and `readCache(key)` (called only by a route, never triggers a
fetch, returns `undefined` until the first job run has completed).

## Conventions

- Routes: `/api/local/*` (Local), `/api/globe/*` (Globe), mounted from
  `server.js` alongside the existing `/events` and `/health` routes, which are
  untouched. Keys only in `.env`, never logged or sent to the client. Shared
  var: `WAQI_TOKEN`. Document new vars in `.env.example` under your own header
  (`# --- LOCAL ---` / `# --- GLOBE ---`).
- All thresholds/weights live in a config JSON in your own config dir. No
  magic numbers in code.
- Correlations are always worded "possible link", never "confirmed cause".
- Coordinates: geocode place names at build time (Open-Meteo Geocoding or
  Nominatim), cache to `data/<view>/places.json`, skip failures. Never
  hardcode guessed coordinates.
- Git: no repo-wide formatting or renames. Touch only owned paths. Add only
  the deps you need. Rebase on `master` before opening a PR (this repo's
  default branch is `master`, not `main`). PR description = env vars,
  endpoints, demo steps.
