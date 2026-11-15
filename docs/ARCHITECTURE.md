# Architecture and deployment

[Back to Parallax](../README.md) · [Data sources](DATA_SOURCES.md) · [Citizen science](CITIZEN_SCIENCE.md)

## Supported production architecture

Parallax has one supported production topology: the React build and Node API run together as a Render Web Service; Supabase is used only for citizen-science Auth and PostgreSQL.

```text
Browser
  ├─ React/Vite/Tailwind UI + Aladin Lite
  ├─ browser FITS display + comparison Web Workers
  ├─ /api/spherex-exposures ─┐
  ├─ /api/spherex-image ─────┴─ Node.js on Render ── Caltech/IPAC IRSA
  └─ Supabase client ─────────── Supabase Auth/PostgreSQL
```

`src/main.jsx` selects the landing/explorer, `/community`, or `/community/:id` view from the pathname. `server/index.js` serves the built files and maps both community route shapes back to `index.html`. Hashed JavaScript, public FITS samples, Aladin's bundled engine/WASM, and the emitted Web Worker are served as ordinary static assets.

`ObservationWorkspace` owns up to 12 selected frames, playback state, the active frame, and one marker per frame. Submitted reports persist only marked frames. A saved investigation reuses the same `SkyViewer` path and original IRSA source URLs; it never searches for newer replacements.

## Node API contracts

### `GET /api/spherex-exposures`

`server/spherex.js` accepts `ra`, `dec`, `fov`, and `collection`. Coordinates and collections are validated before contacting the fixed `https://irsa.ipac.caltech.edu/SIA` service. Scientific query semantics remain a one-arcsecond circle, `RESPONSEFORMAT=TSV`, and `MAXREC=50` for `spherex_dr1` or `spherex_qr3`. The upstream timeout is 25 seconds, redirects are rejected, and no mock response is substituted.

### `GET /api/spherex-image`

`server/exposure.js` accepts one original IRSA URL. The allowlist rejects other hosts, credentials, query strings, fragments, traversal, unsupported collections, and non-FITS paths. The server:

1. Requests bytes `0–18,874,367` with `Range`.
2. Validates a `206` response's `Content-Range` and declared length.
3. Safely handles an upstream that ignores Range and returns `200`.
4. Cancels after the 18 MiB prefix and retains the 100 MiB defensive bound.
5. Uses the runtime-independent parser in `src/lib/fits.js` to copy the original float32 `IMAGE` extension and WCS cards into a primary FITS response.
6. Keeps at most three extracted images in process memory for fast replay.

The upstream timeout is 60 seconds. No reprojection, resampling, subtraction, photometry, or calibration occurs on the server. Display-only SIP correction runs later in a browser worker; candidate identity and checksums use the unmodified extracted bytes.

## Browser comparison pipeline

`ComparisonPanel` selects reference A and comparison B from the existing observation workspace. `loadSpherexExposure()` retrieves both through the same validated Node image route, verifies observation/detector identity and any saved SHA-256, then transfers those dedicated comparison buffers to `compareFits.worker.js`. Existing provenance buffers are never transferred or detached.

`wcs.js` is the single TAN/TAN-SIP transform used by original-footprint validation and comparison. The common output grid is image A's width, height, tangent point, reference pixel, and CD matrix with SIP removed. For every common-grid pixel the worker:

1. Converts output pixel → ICRS RA/Dec with inverse TAN.
2. Converts RA/Dec → original A and B pixels with TAN plus iterative inverse SIP.
3. Bilinearly samples the original big-endian float32 arrays.
4. Keeps the pixel only when every contributing sample is finite and both footprints cover it.

The worker returns aligned A/B FITS layers, raw `B − A` only when both nonempty `BUNIT` strings match exactly, and a dimensionless normalized residual. Normalization subtracts each overlap median and divides by `1.4826 × MAD` with a safe near-zero floor. Difference display uses symmetric 99th-percentile absolute limits and Aladin's `rdbu` linear colormap. The sensitivity control changes only those display limits. Overlay layers use identical robust cuts; B opacity ranges from zero to one, and blink toggles the same aligned B layer.

Only one pair is retained. Pair changes abort downloads, terminate the previous worker, ignore stale job IDs, revoke derived Blob URLs, and remove obsolete Aladin layers. The feature is full resolution; there is no silent preview downsampling. Marking is intentionally disabled in derived views, so candidate markers remain validated against original observations.

## Local development

Node.js 22.12–24 is supported. `package.json` includes an upper bound so a future Render default cannot silently select an untested major.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Vite mounts the two production route handlers in development and preview. Production-equivalent commands are:

```sh
npm test
npm run build
HOST=0.0.0.0 PORT=3000 npm start
```

`server/index.js` respects both `HOST` and `PORT`. There is no lint script; `npm run format` uses the existing Prettier configuration.

## Render deployment

The checked-in `render.yaml` defines a single Node web service:

```yaml
runtime: node
buildCommand: npm ci && npm run build
startCommand: npm start
healthCheckPath: /
```

It sets `HOST=0.0.0.0` and prompts for these build-time public variables:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Deployment steps:

1. Push the reviewed production branch to the repository only when authorized.
2. In Render, choose **New → Blueprint**, connect the repository, and select the branch containing `render.yaml`; alternatively create one Node Web Service with the same commands.
3. Enter the two Supabase values when prompted. Do not add a service-role or secret key.
4. Keep the repository root as the service root. Render supplies `PORT`; do not hardcode it.
5. Deploy and verify `/`, `/community`, a real `/community/:id`, both `/api` routes, and the browser workflow.

No Render deployment has been performed from this repository cleanup. The service must remain continuously available while users load original FITS files; a plan that sleeps or has insufficient memory can degrade timelines and discard the in-memory cache.

## Repository map

```text
src/
  api/spherex.js             live mosaic metadata, archive URL construction and table parsing
  lib/coordinates.js        coordinate validation shared by browser and Node imports
  lib/fits.js               runtime-independent FITS extraction and TAN/SIP footprint checks
  lib/renderFits*.js        browser-only display reprojection and Web Worker
  lib/wcs.js                shared forward/inverse TAN-SIP celestial transforms
  lib/compareFits*.js       aligned overlay/difference engine and Web Worker
  lib/loadExposure.js       browser retrieval, identity and checksum validation
  lib/supabase.js           client and anonymous authentication
  components/               sky viewer, archive, timeline, tutorial and landing UI
  citizen/                  report, community, review, validation and persistence code
server/
  index.js                  static production server and SPA routing
  spherex.js                fixed IRSA archive-search route
  exposure.js               fixed IRSA FITS extraction route and three-image cache
supabase/migrations/        citizen-science schema, validation, RLS and summary view
tests/                      Node tests, captured fixtures and local PGlite policy tests
public/samples/             labeled non-SPHEREx tutorial FITS files and provenance
render.yaml                 single-service Render Blueprint
```

`src/api/observations.js` and `useObservations` are legacy mock/HTTP adapter code retained for contract tests and possible future adapters. They are not mounted by the public explorer and never act as a fallback for failed IRSA requests.

## Endpoint security and operational risks

The Node routes are public because exploration does not require registration. Security relies on fixed upstreams, strict parameters and URL allowlists, redirect rejection, timeouts, bounded reads, and non-detailed error responses. CORS is not needed for same-origin production traffic and is not an abuse-control mechanism.

There is no application-level rate limiter. Public users can consume Render bandwidth, memory, and IRSA capacity. The three-image cache is process-local, is cleared by restart or scale-out, and is not shared between instances. Add platform monitoring and rate controls before high traffic; do not weaken Supabase RLS to solve API availability.

## Serverless experiment and production decision

Supabase Edge Functions were evaluated on 2026-11-15 to remove the continuously running Node service. The complete implementation, tests, Vercel configuration, and benchmark script are preserved in local Git commit `8a86c1c` on `experiment/supabase-edge-functions`.

The scientific result was successful: Node, local Edge, and hosted Edge handlers produced the same 16,672,320-byte extracted FITS with SHA-256 `aee31dfc60b2e2a1fdf46a14449e1101a422ec4b7d79190aea64be63258192f9`, preserving the same TAN-SIP WCS and float32 pixels. Controlled DR1/QR3 searches also passed through both backends.

The operational result favored Node:

- One uncached Node image took about 8.5 seconds; its warmed cache served the same image in 11 ms and three concurrent warmed requests in 14–37 ms.
- Hosted Edge sequential image requests took about 7.5–29 seconds and had no reliable persistent cache.
- Two simultaneous Edge requests succeeded at about 21 seconds each.
- Three simultaneous Edge requests reached 268,500,545 bytes, exceeded the 256 MiB worker limit, and all returned HTTP 546 `WORKER_RESOURCE_LIMIT`.
- Transient IRSA 502s occurred through both paths, so they were not treated as a Supabase-specific failure.

Node was therefore selected for production reliability and repeated timeline performance. Reconsider serverless image delivery only after a materially lower-memory streaming design, real concurrency tests, and a measured caching/egress strategy. The safe byte-range optimization identified during the experiment is retained in the Node route.

## Hosted experimental functions

Repository cleanup does not delete remote resources. A read-only check on 2026-11-15 found these experimental functions still active in project `nbgjntchtcpjyekbizwd`:

- `spherex-exposures` — version 3, `verify_jwt=false`
- `spherex-image` — version 1, `verify_jwt=false`

The production frontend no longer references `/functions/v1/*`. After the Render deployment has been verified, an authorized project owner can inspect and remove only these two functions:

```sh
npx supabase functions list --remote=nbgjntchtcpjyekbizwd
npx supabase functions delete spherex-exposures --remote=nbgjntchtcpjyekbizwd
npx supabase functions delete spherex-image --remote=nbgjntchtcpjyekbizwd
```

The current CLI displays the target and asks for confirmation. Do not use a project-delete command, `functions deploy --prune`, or remove the database/Auth resources. No remote function was deleted during this cleanup.

## Verification boundaries

Automated tests cover coordinate/query validation, allowed and rejected FITS URLs, Range and non-Range upstream behavior, byte-identical extraction, WCS/pixels, display reprojection, comparison sign and normalization, shifted/rotated/scaled/SIP grids, RA wraparound, overlap masks, stale jobs, candidate validation, agreement calculations, and PGlite execution of database policies with separate identities.

A full-resolution real comparison used DR1 `2025W37_1A_0290_1` D1 and QR3 `2026W37_2A_0218_1` D1. Both declared `MJy / sr` and the same nominal 0.7455–1.1167 µm archive bounds. Alignment retained 3,814,047 of 4,161,600 pixels (91.65%), took about 10.6 seconds in Node as a worker-algorithm proxy, and used about 95 MiB of ArrayBuffers after reducing intermediate copies. A 1/64 pixel sample of aligned layers had Pearson correlation 0.967, which is evidence of approximate registration for this pair, not independent scientific validation or proof of astrophysical residuals.

Live archive behavior still depends on IRSA. Browser automation was unavailable during implementation, so Aladin interaction, opacity/blink controls, timeline/marker regressions, and the two-user citizen-science flow still require manual verification in the production browser. A deployment should not be presented as fully verified until the checklist in [Citizen science](CITIZEN_SCIENCE.md#verification) succeeds against Render.
