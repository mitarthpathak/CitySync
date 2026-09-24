# CityPulse frontend

Vite + React (plain JavaScript) app. It has three screens:

| Route         | Screen                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| `/`           | Landing page (CitySync). Ported 1:1 from `mitarthpathak/citysync-landing-page-design`. |
| `/app`        | Global overview: "The world, in pulse." with the 3D globe.             |
| `/app/local`  | Local overview for Amer, Jaipur: area pulse, key readings, map, feed.  |

Every "Enter the live app" / "See the pulse" / "Explore the live view" button on the landing page opens the app.

## Run

Requires Node 18 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

The globe reads live events from the backend (`../server.js`, port 3000), so start that too (`npm start` in the project root). Without it the globe still renders and shows an "offline" pill.

## The globe (`GlobeView`)

`src/app/GlobeView.jsx` (plus `GlobeView.css`) is the 3D globe on `/app`, built on `react-globe.gl` and `three`. It is one self-contained component:

```jsx
<GlobeView onSelectEvent={(event) => { /* show your detail panel */ }} theme="light" />
```

| Prop            | What it does |
| --------------- | ------------ |
| `onSelectEvent` | Called with the clicked event, exactly the backend shape `{ id, type, title, lat, lng, timestamp, severity, source, isSimulated, raw }`. The globe also flies to the point. |
| `theme`         | `"light"` or `"dark"`. Optional; defaults to the app theme (`<html class="dark">`). |
| `apiUrl`, `pollMs` | Optional. Default `<VITE_API_URL>/events?scope=global` (`VITE_API_URL` defaults to `http://localhost:3000`, see `.env.example`) and 45 000 ms. |

It fills its parent, so give the parent a size. `GlobalView.jsx` puts it in the globe panel; nothing else on that screen was changed. No detail panel is wired up yet, so `onSelectEvent` is not passed there.

- **Modes:** a Normal / Satellite toggle (top right) swaps `globeImageUrl` and `bumpImageUrl` between the local textures in `public/textures/` (`earth-day.jpg`, `earth-blue-marble.jpg`, `earth-topology.png`). Nothing is loaded from a CDN. The choice is remembered.
- **Data:** `GET /events?scope=global`, refreshed every 45 s (paused while the tab is hidden). The last good data stays on screen if the API goes down, and a small pill at the bottom left shows live, loading or offline. Malformed events are dropped and severity is clamped to 1 to 5.
- **Points:** coloured by severity (1 slate, 2 green, 3 amber, 4 orange, 5 red), taller and wider as severity rises. Events at severity 4 and above also get a pulsing ring. Hovering shows title, source and a **SIMULATED** tag when `isSimulated` is true (titles are HTML-escaped, since they come from third-party feeds).
- **Performance:** at most 500 points (most severe, then newest) and 24 rings. Unchanged events keep their object identity between polls, so a refresh only adds or removes the meshes that really changed. The WebGL context is released on unmount.
- **Motion:** gentle auto-rotate that pauses while you drag or zoom and resumes after 4 s. With `prefers-reduced-motion` there is no auto-rotate, no rings and no fly-to animation.
- **No WebGL:** the globe shows a short message instead of crashing the page.

The globe (react-globe.gl and three.js, about 2 MB) is a lazy chunk that only `/app` loads, so the landing page stays light.

The `N 42°` / `E 74°` readouts over the globe panel are still static HTML in `GlobalView.jsx` (`.cp-coord-n`, `.cp-coord-e`).

## Data

The numbers and text on `/app` outside the globe, and on `/app/local` (24 events, index 72, Amer readings, feeds, and so on) are static demo content in `src/app/data.js`, matching the design mock-ups. Only the globe reads the CityPulse API. The layer chips (Earthquakes, Weather, ...) are not connected to the globe yet.

## Theme

Light and dark share one switch: the `dark` class on `<html>`, exactly as on the landing page. The header button and the floating button on `/app` stay in sync with it.

## Notes on the port

- The landing page keeps its original markup and its original `globals.css` byte for byte (`src/styles/globals.css`). It is plain JavaScript (`.jsx`) instead of TypeScript; the type annotations were the only thing removed.
- Next.js specifics were replaced: `<Analytics />` from `@vercel/analytics/react` (production builds only), page metadata moved into `index.html`, and `vercel.json` adds the SPA rewrite so `/app/local` works on a direct visit.
- Outside Vercel, `npm run preview` logs a 404 for `/_vercel/insights/script.js`. That is the analytics script and is harmless; it does not run in `npm run dev`.
- `src/components/ui/button.jsx` and `components.json` come from the original project (unused by the landing page, kept so `npx shadcn add ...` still works).
- App styles live in `src/styles/app.css`, scoped under `body.cp-body`, so they cannot leak into the landing page.
