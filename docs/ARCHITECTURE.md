# Architecture & development

[Back to Parallax](../README.md) · [Data sources](DATA_SOURCES.md) · [Citizen science](CITIZEN_SCIENCE.md)

## Runtime and data flow

Parallax is a JavaScript/JSX React application, built with Vite and Tailwind CSS. `src/main.jsx` selects the landing/explorer or community view from the pathname; navigation uses ordinary links rather than a router dependency. `/community/:id` restores a saved candidate.

```text
Vercel static frontend
  ├─ IRSA mosaic tiles (direct)
  ├─ SPHEREx transport
  │    ├─ node mode → /api/* → preserved Node server → IRSA
  │    └─ supabase mode → public Edge Functions → IRSA
  ├─ FITS display worker (browser-only SIP correction)
  └─ Supabase Auth/PostgreSQL
       ├─ candidate submission
       └─ community investigation and assessment
```

`ObservationWorkspace` owns up to 12 selected frames, the active frame, playback and per-frame markers. Frames remain in selection order; search results are date-sorted, but adding frames does not automatically reorder the sequence. Playback waits for image readiness. Draft frames and markers live in React state and do not survive a full reload; submitted reports are persisted in Supabase. Only marked frames are submitted.

The live path uses `src/api/spherex.js`. `src/api/spherexTransport.js` selects the same-origin Node endpoints or the Supabase function URLs at build time. Saved investigations use the same `SkyViewer` path, so replay automatically follows the selected transport while candidate records continue storing original IRSA URLs. `src/api/observations.js` and `useObservations` are legacy code, not mounted by the public explorer.

Runtime-independent coordinate validation, archive URL construction, exposure URL allowlisting, and FITS parsing live in `supabase/functions/_shared/`. Browser and Node imports re-export or consume those modules; there is one scientific implementation rather than separate Edge copies. The Edge bundle contains no React, DOM, Aladin, or browser worker code.

## Run

Use Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. The default configuration works without an API key. Aladin JavaScript and its embedded WebAssembly engine are bundled locally from the pinned npm package. A browser with WebGL2 is required. Remote sky tiles and optional catalog services still require internet access; bundling the engine does not make the atlas an offline sky viewer. If engine initialization fails, the app shows a viewer error; the failure is shown without substituting demo observations.

```sh
npm test
npm run build
npm run preview
```

The production output is `dist/`. In Node mode, run `npm start` to serve it with the preserved APIs at `http://127.0.0.1:3000`; `HOST` and `PORT` remain supported. In Supabase mode, Vercel serves only static output and the browser calls Edge Functions directly. Configure Supabase separately for persistence. Root-relative assets support community routes; serve through HTTP rather than opening `index.html` as a file.

### API transport

```dotenv
# Default local/fallback behavior
VITE_SPHEREX_API_MODE=node

# Static Vercel deployment
VITE_SPHEREX_API_MODE=supabase
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`node` targets `/api/spherex-exposures` and `/api/spherex-image`. `supabase` targets `${VITE_SUPABASE_URL}/functions/v1/...` and sends the publishable key in the `apikey` header, never as a bearer token. Public exploration does not create an Auth session; anonymous Auth remains limited to candidate and classification writes. Vite embeds these variables during the build, so changing them requires a rebuild.

## Explore

- Enter ICRS RA [0, 360), Dec [−90, 90], and FOV [0.01, 180] in decimal degrees, then apply.
- Choose a real SPHEREx wavelength above the atlas, or use Change sky map to select a local FITS sample or DSS2.
- Real archive results load at your applied coordinates. Use **Find images here** to retry or refresh; DR1/QR3 selection is under Search options.
- Choose a real infrared wavelength above the map. Open archive images to build an observation timeline.
- Open images to add them to the real timeline. Scrub, step, play/pause, or adjust playback speed; playback waits for each original image to load.
- Archive requests are cancelled when the selected position or collection changes; stale responses are ignored.
- Overlay and Difference switch between implementation placeholders; no scientific subtraction is performed.

## Structure

```text
src/
  App.jsx, main.jsx             landing/explorer and community route selection
  api/spherex.js                live cube metadata, SIA queries and exposure parsing
  api/spherexTransport.js       Node/Supabase endpoint and header selection
  api/observations.js           legacy mock/HTTP adapter (not mounted)
  hooks/useObservations.js      legacy async adapter hook
  lib/aladin.js                 shared local module/WASM initialization
  lib/coordinates.js           input validation
  lib/fits.js                  IMAGE extraction and original TAN/SIP footprint checks
  lib/renderFits.js            display-only SIP-to-TAN resampling
  lib/renderFits.worker.js     background display preparation
  lib/supabase.js              shared client and anonymous authentication
  components/                  sky viewer, archive results, timeline, tutorial, landing
  citizen/                     workspace, candidate form, community, validation and API
  styles.css                   Tailwind import and theme
server/
  index.js                     production assets and community routing
  spherex.js                   fixed-origin archive search endpoint
  exposure.js                  fixed-origin original IMAGE extraction endpoint
supabase/migrations/           schema, validation, RLS and review summary view
supabase/functions/
  _shared/                     canonical validation, FITS parser and handlers
  spherex-exposures/           public SIA search Edge entrypoint
  spherex-image/               public extracted-FITS Edge entrypoint
supabase/config.toml           public-function JWT configuration
scripts/verify-edge-fits.mjs   Node/Edge byte-identity verifier
tests/                        Node test runner, fixtures and PGlite policy tests
public/samples/               non-SPHEREx reference FITS images and provenance
vercel.json                   Vite output and SPA fallback
```

## Public endpoint security

Both functions set `verify_jwt = false` because archive exploration must work without a user JWT. This matches Supabase's public-function configuration. The frontend still sends its publishable key in `apikey` following the current key convention; it sends no `Authorization` header and the handler intentionally does not treat that public key as user authentication.

CORS allows `GET` and `OPTIONS` from `*`, including localhost and an eventual Vercel domain. The functions never use cookies or credentialed CORS, and CORS is not an access-control boundary. The archive host, collections, search radius, result limit, and FITS paths are fixed or validated. Redirects, credentials, query strings, fragments, traversal, unsupported methods, and unsupported files are rejected. Timeouts and bounded reads limit a single request; errors expose no stack traces.

No application-level rate limiter is included. In-memory counters would be inconsistent across isolates. Public callers can consume Edge invocations, IRSA bandwidth, and Supabase egress; configure Supabase/platform monitoring and upstream rate controls or a managed gateway/WAF before high-traffic use. Do not weaken database RLS for these functions—they do not access the citizen-science tables.

## Edge runtime limits and FITS feasibility

As of 2026-11-15, [Supabase documents](https://supabase.com/docs/guides/functions/limits) 256 MB maximum memory, 2 seconds CPU per request, 150 seconds request-idle timeout, and 150 seconds free/400 seconds paid wall-clock duration. The bundled-function limit is 20 MB when bundled locally with the CLI or 5 MB when bundled server-side. The source fetch has a 60-second application timeout, reads at most the first 18 MiB, and builds one extracted output. The function has no persistent image cache.

The published limits page does **not** state a maximum request- or response-body size. A hosted request successfully returned the 16,672,320-byte representative output with the expected checksum. Function responses count toward [Supabase bandwidth/egress](https://supabase.com/docs/guides/storage/serving/bandwidth); repeated timelines can consume quota quickly. Storage caching remains a future optimization only after measurement.

Verification of a real DR1 product produced identical Node, local Edge-handler, and hosted Edge Function SHA-256 values (`aee31dfc60b2e2a1fdf46a14449e1101a422ec4b7d79190aea64be63258192f9`). Supabase reported approximately 205 MiB total worker memory after a single hosted request. Two concurrent hosted requests succeeded in about 21 seconds each, but three concurrent requests terminated the worker at 268,500,545 bytes and returned HTTP 546 `WORKER_RESOURCE_LIMIT` to every client.

## Vercel static frontend

`vercel.json` selects Vite, builds to `dist`, and rewrites non-file routes to `index.html`, so `/community` and `/community/:id` survive direct visits. Vercel's filesystem takes precedence, so hashed JavaScript, the emitted FITS worker, embedded Aladin WASM data, and `public/samples` remain static assets. Parallax does not require cross-origin isolation headers and no Vercel Function or API proxy handles large FITS responses.

Set these Vercel environment variables for Production and Preview, then redeploy:

```dotenv
VITE_SPHEREX_API_MODE=supabase
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Build command: `npm run build`. Output directory: `dist`. Install command: `npm ci`.

## Deployment

These commands prepare the supplied Supabase project without changing the database schema. Run them only when ready to deploy:

```sh
npx supabase login
npx supabase link --project-ref nbgjntchtcpjyekbizwd
npx supabase functions deploy spherex-exposures --project-ref nbgjntchtcpjyekbizwd
npx supabase functions deploy spherex-image --project-ref nbgjntchtcpjyekbizwd
```

`supabase/config.toml` carries `verify_jwt = false`; do not add `--no-verify-jwt` ad hoc. Both functions were deployed to project `nbgjntchtcpjyekbizwd` on 2026-11-15. No database change or Vercel deployment was performed. Configure the three Vercel variables above only after the archive-search release gate below is resolved.

Hosted `spherex-image` verification passed CORS, method handling, the 16,672,320-byte response, WCS/pixel preservation, and checksum identity. Hosted `spherex-exposures` passed controlled DR1 and QR3 searches in both default and US West execution regions. Transient IRSA HTTP 502 responses occurred through both Node and Edge during the wider test, so they are not evidence of a Supabase-specific incompatibility. Do not substitute mock data or silently change the archive query.

## Production decision

As tested on 2026-11-15, the complete Supabase serverless backend is **not a better production replacement** for the Node server:

- Search performance is comparable once IRSA is responsive: two controlled rounds returned HTTP 200 for direct IRSA, Node, and Edge DR1/QR3 queries in approximately 1.0–2.3 seconds.
- One uncached Node FITS request took 8.5 seconds. Its bounded three-image cache then served the same 16,672,320-byte image in 11 ms and three simultaneous warmed requests in 14–37 ms.
- Hosted Edge has no persistent cache. Sequential representative requests took 7.5–29 seconds; two concurrent requests took about 21 seconds each; three concurrent requests exhausted the 256 MB worker and all failed.
- Every successful path produced the same SHA-256 and preserved the same scientific pixels and WCS. This is an operational limit, not a scientific-correctness difference.

Keep `VITE_SPHEREX_API_MODE=node` for the public application. The Edge archive-search function is viable independently, but the current transport selects one backend for both endpoints, so a hybrid deployment is not yet configured. Before reconsidering serverless image delivery, add and verify an upstream byte-range request, reduce buffer copies, and retest concurrency. IRSA returned HTTP 206 with `Content-Range: bytes 0-18874367/60157440` during a bounded capability check, so range retrieval is a concrete optimization opportunity. Storage caching should still be introduced only after measurement.

To switch back, set `VITE_SPHEREX_API_MODE=node`, rebuild, and deploy `dist` with `npm start`. The Node routes and scripts are unchanged except that they import the canonical shared validators/parser.

## Aladin Lite and dependencies

Uses the official Aladin Lite npm integration (`import A`, await `A.init`, then `A.aladin`) and retains its attribution controls. The stable `aladin-lite@3.8.2` dependency is pinned in package.json and package-lock.json. Vite emits the dynamically imported engine as a local production asset; the package embeds its WASM as a data URL, so engine startup does not fetch JavaScript or WASM from the Aladin server. `VITE_ALADIN_SCRIPT_URL` is no longer used and can be removed from existing .env files. Restart the dev server after updating dependencies. Survey tiles, survey discovery, and optional catalog services remain external runtime dependencies and can fail independently of engine startup. Aladin Lite is LGPL-3.0-or-later; review upstream licenses and image attribution before redistribution or public deployment.

- [Aladin Lite integration documentation](https://cds-astro.github.io/aladin-lite/)
- [Vite guide](https://vite.dev/guide/)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)

## Verification scope

`npm test` checks legacy adapter contracts, Edge CORS and methods, archive/input validation, timeouts and upstream failures, transport selection, FITS binary identity, candidate validation, and PGlite RLS behavior. `npm run build` verifies the production bundle. Hosted response-size support is verified for one representative image; these checks do not establish Edge concurrency, remote atlas availability, browser WebGL support, or continued IRSA availability.

## Landing page and guided tutorial

The single-page site opens on the Parallax landing page, using the charcoal and lavender palette, serif headlines, orbital illustration, and scroll-reactive starfield adapted from the supplied Planet X design. Navigation and calls to action lead to the existing explorer section without resetting its state.

The explorer keeps its desktop arrangement: coordinates and comparison controls on the left; sample selector and Aladin atlas on the right, followed by the selected-image timeline; provenance is available in image details. Narrow layouts stack the same controls. The existing FITS loading, coordinate navigation, API abstraction remain in place.

Use **Tutorial**, **Take a quick tour**, or **Guide me** for a five-step spotlight tour. Next/Back and the left/right arrow keys navigate; Escape or Skip closes it. Native modal focus containment keeps keyboard navigation inside the tour, and focus returns to the launcher on close. The tour does not change coordinates, selected images, bands, or playback settings.

The canvas starfield responds to pointer motion and accelerates with scroll. Reduced-motion preferences produce a static starfield and disable orbital motion and smooth scrolling. Animation pauses while the document is hidden. Fonts use local system and Georgia serif fallbacks; the landing page adds no external font or script dependency.

## Verification and deployment boundaries

The repository provides `npm test`, `npm run build`, `npm run preview`, `npm start`, `npm run format`, and `npm run verify:edge-fits -- /path/to/original.fits`. There is no lint script. The final migration verification passed all 27 tests, and both Node-mode and Supabase-mode production builds succeeded. The build retains existing large-chunk warnings for the viewer bundle.

Read-only local and hosted calls through the new handler returned 50 real records for DR1 and QR3 at the test position. Live cube metadata reported the expected 102 channels. Browser checks from the earlier implementation confirmed the colored mosaic, rendering of an original exposure, and a celestial-coordinate marker; browser automation was unavailable during this benchmark. Supabase CLI serving could not run because Docker was not active. Both Edge Functions are deployed, but the three-request hosted FITS concurrency test failed at the memory limit. Vercel routing and the two-user citizen-science review flow remain unverified. Before replacement, resolve that blocker and follow the [end-to-end checklist](CITIZEN_SCIENCE.md#verification).

Use HTTPS outside local development: image checksums and report IDs rely on browser crypto APIs. Vite exposes `VITE_*` values in the client bundle; never put secrets there. Supabase is optional for exploration and required for submission/review. The package's existing internal npm name is a historical identifier; this documentation change does not rename the package or alter application code.
