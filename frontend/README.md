# CityPulse frontend

Vite + React (plain JavaScript) app. It has three screens:

| Route         | Screen                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| `/`           | Landing page (CitySync). Ported 1:1 from `mitarthpathak/citysync-landing-page-design`. |
| `/app`        | Global overview: "The world, in pulse." with the globe area.           |
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

The backend (`../server.js`, port 3000) is separate and is not used by these screens yet; see "Data" below.

## Where the globe goes

The globe area on `/app` is an empty, full-size three.js canvas.

- `src/app/GlobeCanvas.jsx` does the plumbing: `WebGLRenderer` (transparent background), resize, pixel ratio, render loop, tab-hidden pause, cleanup. You should not need to touch it.
- `src/app/globe/createGlobeScene.js` is the one file to edit. It receives `{ THREE, scene, camera, renderer, state }`, and can return `frame(dt)`, `update(state)` (theme, layer chips, events), `resize(w, h)` and `dispose()`.
- The `N 42°` / `E 74°` readouts are plain HTML overlays in `GlobalView.jsx` (`.cp-coord-n`, `.cp-coord-e`). Move or remove them to suit the real globe.
- In dev mode a small grey hint is shown at the bottom of the panel (`.cp-globe-slot` in `GlobeCanvas.jsx`). Delete it when the globe is in.

three.js is loaded lazily, so the landing page does not pay for it.

## Data

The numbers and text on `/app` and `/app/local` (24 events, index 72, Amer readings, feeds, and so on) are static demo content in `src/app/data.js`, matching the design mock-ups. Nothing on those screens comes from the CityPulse API yet. The API is `GET http://localhost:3000/events?scope=global|local` and has CORS enabled for all origins, so it can be called straight from this app.

## Theme

Light and dark share one switch: the `dark` class on `<html>`, exactly as on the landing page. The header button and the floating button on `/app` stay in sync with it.

## Notes on the port

- The landing page keeps its original markup and its original `globals.css` byte for byte (`src/styles/globals.css`). It is plain JavaScript (`.jsx`) instead of TypeScript; the type annotations were the only thing removed.
- Next.js specifics were replaced: `<Analytics />` from `@vercel/analytics/react` (production builds only), page metadata moved into `index.html`, and `vercel.json` adds the SPA rewrite so `/app/local` works on a direct visit.
- Outside Vercel, `npm run preview` logs a 404 for `/_vercel/insights/script.js`. That is the analytics script and is harmless; it does not run in `npm run dev`.
- `src/components/ui/button.jsx` and `components.json` come from the original project (unused by the landing page, kept so `npx shadcn add ...` still works).
- App styles live in `src/styles/app.css`, scoped under `body.cp-body`, so they cannot leak into the landing page.
