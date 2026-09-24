# CityPulse frontend

Vite + React (plain JavaScript) app.

| Route         | Screen                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| `/`           | Landing page (CitySync). Ported 1:1 from `mitarthpathak/citysync-landing-page-design`. |
| `/app`        | Global overview: "The world, in pulse." with the 3D globe.             |
| `/app/local`  | Local overview: area pulse, key readings, live map, feed, for a chosen location. |

`/app` and `/app/local` are both rendered by one `AppShell`, which crossfades between the Global and Local views (Framer Motion, ~340ms) rather than swapping pages — the globe stays mounted (just paused) while Local is showing, since re-initialising three.js is expensive; the Local view's Leaflet map mounts and unmounts normally, since that's cheap. Every "Enter the live app" / "See the pulse" / "Explore the live view" button on the landing page opens the app.

## Run

Requires Node 18 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Both views read live events from the backend (`../server.js`, port 3000), so start that too (`npm start` in the project root). Without it, both still render and show a "reconnecting" / "offline" state rather than breaking.

## The globe (`GlobeView`)

`src/app/GlobeView.jsx` (plus `GlobeView.css`) is the 3D globe on `/app`, built on `react-globe.gl` and `three`. It is one self-contained component:

```jsx
<GlobeView onSelectEvent={(event) => setSelectedEvent(event)} theme="light" active />
```

| Prop            | What it does |
| --------------- | ------------ |
| `onSelectEvent` | Called with the clicked event, exactly the backend shape `{ id, type, title, lat, lng, timestamp, severity, source, isSimulated, raw }`. The globe also flies to the point. `AppShell` passes this straight to the shared `EventPanel`. |
| `theme`         | `"light"` or `"dark"`. Optional; defaults to the shared app theme. |
| `active`        | Default `true`. `AppShell` sets this to `false` while the Local view is showing, which pauses the render loop without unmounting. |
| `pollMs`        | Optional refresh interval for `GET /events?scope=global` (via the shared `useEvents` hook), default 45 000. |

It fills its parent, so give the parent a size. `GlobalView.jsx` puts it in the globe panel; nothing else on that screen was changed.

- **Modes:** a Normal / Satellite toggle (top right) swaps `globeImageUrl` and `bumpImageUrl` between the local textures in `public/textures/` (`earth-day.jpg`, `earth-blue-marble.jpg`, `earth-topology.png`). Nothing is loaded from a CDN. The choice is remembered.
- **Points:** coloured by severity (1 slate, 2 green, 3 amber, 4 orange, 5 red; see `src/lib/severity.js`), taller and wider as severity rises. Events at severity 4 and above also get a pulsing ring. Hovering shows title, source and a **SIMULATED** tag when `isSimulated` is true (titles are HTML-escaped, since they come from third-party feeds).
- **Performance:** at most 500 points (most severe, then newest) and 24 rings. Unchanged events keep their object identity between polls, so a refresh only adds or removes the meshes that really changed. The WebGL context is released on unmount.
- **Motion:** gentle auto-rotate that pauses while you drag or zoom and resumes after 4 s. With `prefers-reduced-motion` there is no auto-rotate, no rings and no fly-to animation.
- **No WebGL:** the globe shows a short message instead of crashing the page.

The globe (react-globe.gl and three.js, about 2 MB) is its own lazy chunk that only mounts when the Global view actually renders; `AppShell` itself is also lazy, so the landing page's bundle is free of it, Leaflet and Framer Motion entirely.

The `N 42°` / `E 74°` readouts over the globe panel are still static HTML in `GlobalView.jsx` (`.cp-coord-n`, `.cp-coord-e`).

## The local map (`LocalMap`)

`src/app/LocalMap.jsx` is a real Leaflet map (`react-leaflet`), centred on the chosen location:

```jsx
<LocalMap center={{ lat, lng }} events={events} radiusKm={15} onSelectEvent={setSelectedEvent} />
```

- **Tiles:** Esri's free, keyless "gray canvas" basemaps (`World_Light_Gray_Base` / `World_Dark_Gray_Base`, each with a matching `..._Reference` layer on top for roads and place labels). CartoDB's anonymous basemaps started requiring an API key partway through this build — their tiles now render an "API KEY REQUIRED" watermark — so this project uses Esri's instead. Esri only serves these up to native zoom 16.
- **Markers:** the centre point gets the same pin, with a halo, as before; each event gets a pin coloured by severity tier (reusing the app's existing blue/amber/crimson tokens, not the globe's 5-colour scale) and opens the shared `EventPanel` on click.
- **Radius:** a translucent circle shows the active 15 km radius around the centre.
- **Empty state:** "No active signals within {radius} km" if the location has none, without hiding the map itself.
- **Recenter button:** flies back to the centre point.

## Location selector (`LocationSelector`, Local view only)

Two ways to pick the point that drives the Local view: a dropdown of presets (`src/config/locations.config.js` — add more there, nothing else needs to change) and a "Use my location" button (`navigator.geolocation`). Every geolocation outcome — granted, denied, unavailable, timeout, or a thrown error from a non-standard implementation — falls back to the default location (Amer, Jaipur) and shows a small, dismissible, auto-hiding note; it never blocks the UI. The choice is persisted to `localStorage` (`cp.location`) and survives a reload.

The selected location drives the map centre, the Local view's header, and the events query (`GET /events?scope=local&lat=..&lng=..`). Until the backend honours `lat`/`lng` for the local scope, `src/app/useEvents.js` also filters the response client-side by haversine distance, so the feature works today and stays correct once the backend catches up.

## Shared event detail panel (`EventPanel`)

One panel, used by both the globe and the map. `AppShell` owns the `selectedEvent` state and renders `<EventPanel event={selectedEvent} onClose={...} />` once; it renders nothing while `event` is null.

- Slides in from the right on desktop, as a bottom sheet on mobile (Framer Motion; instant with `prefers-reduced-motion`).
- Shows title, type, a severity chip (coloured via `src/lib/severity.js`), a **SIMULATED** badge when applicable, source, relative + absolute timestamp, coordinates (with a link to OpenStreetMap), and a plain-language rendering of the event's `raw` object.
- Closes on Escape, on a backdrop click, or via the close button; traps Tab focus while open and restores focus to whatever was focused before it opened.

## Shared theme (`ThemeProvider`)

`src/app/ThemeProvider.jsx` holds `"light" | "dark"` in context, persisted to `localStorage` (`cp.theme`), defaulting to `prefers-color-scheme`. An inline script in `index.html` sets the `dark` class on `<html>` before React (or any CSS) paints, so there's no flash of the wrong theme on load. `useTheme.js` is now a thin `{ dark, toggle }` wrapper over that context, kept so existing consumers (`ThemeButton`, `GlobeView`) didn't need to change. The toggle in the header and the floating button both read/write the same state, and it propagates to the globe (`data-theme`) and the map (tile URLs) without either prop-drilling through the other.

The landing page's own theme toggle is untouched and still works standalone (it manipulates the same `dark` class directly, independent of this context).

## Shared data layer (`useEvents`, `useHealth`)

`src/app/useEvents.js` exports both:

- `useEvents({ scope: "global" | "local", lat, lng, pollMs })` → `{ events, loading, error, lastUpdated, radiusKm }`. Fetches `GET {API_BASE}/events?scope=...`, polling every 45 s by default (paused while the tab is hidden), keeping the last good data on screen through a failed poll. Every event is re-validated against the exact backend schema before use; malformed ones are dropped. `radiusKm` is `15` for `"local"`, `null` for `"global"`.
- `useHealth()` → `{ status, mode, feeds, count, error, lastUpdated }` from `GET {API_BASE}/health`, polled every 20 s. The header's live/mock/offline pill is driven by this.

`API_BASE` comes from `VITE_API_BASE` (see `.env.example`), defaulting to `http://localhost:3000`; no component hardcodes the URL.

## Notes on the port

- The landing page keeps its original markup and its original `globals.css` byte for byte (`src/styles/globals.css`). It is plain JavaScript (`.jsx`) instead of TypeScript; the type annotations were the only thing removed.
- Next.js specifics were replaced: `<Analytics />` from `@vercel/analytics/react` (production builds only), page metadata moved into `index.html`, and `vercel.json` adds the SPA rewrite so `/app/local` works on a direct visit.
- Outside Vercel, `npm run preview` logs a 404 for `/_vercel/insights/script.js`. That is the analytics script and is harmless; it does not run in `npm run dev`.
- `src/components/ui/button.jsx` and `components.json` come from the original project (unused by the landing page, kept so `npx shadcn add ...` still works).
- App styles live in `src/styles/app.css`, scoped under `body.cp-body`, so they cannot leak into the landing page.

## What's still demo data

The five key-reading tiles, the "Possible correlation" card and the "Recent signals" incident feed on `/app/local` are static placeholder content in `src/app/data.js` (they don't change when you pick a different location). Only the map's markers and the globe's points come from the live API. The Global view's layer chips (Earthquakes, Weather, ...) aren't wired to anything yet either.
