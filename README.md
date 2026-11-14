# Parallax

Runnable React + Vite + Tailwind starter for a public sky explorer inspired by the NASA Space Apps SPHEREx challenge. Independent prototype; no NASA affiliation or endorsement implied.

**Live SPHEREx resources are connected.** The atlas opens the official IRSA SPHEREx DR1 all-sky HiPS mosaic with wavelength selection from live metadata. An archive search retrieves real DR1 or QR3 wide-survey spectral exposures and original FITS download links for the applied coordinates. The public explorer no longer uses synthetic observations or demo band groups. Archive results load automatically for the selected position. Open original exposures to build the real image timeline; no data is invented when the archive is unavailable. The mosaic uses a magma false-color brightness palette, not visible-light colors. Difference and overlay remain UI placeholders.

## Run

Use Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open the local URL printed by Vite. The default configuration works without an API key. Aladin JavaScript and its embedded WebAssembly engine are bundled locally from the pinned npm package. A browser with WebGL2 is required. Remote sky tiles and optional catalog services still require internet access; bundling the engine does not make the atlas an offline sky viewer. If engine initialization fails, the app shows a viewer error; the failure is shown without substituting demo observations.

```sh
npm test
npm run build
npm run preview
```

The production output is `dist/`. Run `npm start` to serve the production build and the archive API (default http://127.0.0.1:3000). Set `HOST=0.0.0.0` and `PORT` as appropriate for your deployment, with HTTPS at your hosting layer. A static-only deployment supports the mosaic and local samples but needs the `/api/spherex-exposures` server route for exposure searches. Root-relative assets support the dedicated community routes; serve through HTTP rather than opening index.html as a file. The ZIP includes source and the npm lockfile, excluding dependencies and generated output.

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
  api/observations.js          provider selection, response validation, mock data
  hooks/useObservations.js    async loading, error handling, cancellation
  lib/aladin.js               shared local module/WASM initialization
  lib/coordinates.js          input validation
  components/
    SkyViewer.jsx             Aladin reference atlas and coordinate updates
    PositionForm.jsx          RA/Dec/FOV entry
    Timeline.jsx              scrubber and playback controls
    ComparisonPanel.jsx       clearly marked comparison placeholders
  App.jsx                     application state and layout
  styles.css                  Tailwind import and theme
tests/                        Node test runner contract checks
```

## Legacy mock adapter (not used by the public explorer)

The adapter boundary is `getObservations(query, { signal })`. It returns chronologically sorted records and defaults to `mock`. This legacy adapter is retained for tests and future adapter development; it is not mounted in the public explorer. Live IRSA resources use the separate `src/api/spherex.js` module.

For your own backend adapter, set these values in `.env` and restart Vite (rebuild before deployment):

```dotenv
VITE_OBSERVATION_MODE=http
VITE_OBSERVATION_API_URL=https://your-own-adapter.example/observations
```

The browser sends a GET to that exact URL with `ra`, `dec`, `fov` in degrees and `band` (a demo group ID). The server must support browser CORS or be served from the same origin. Do not put API secrets in `VITE_*`: these values are public in the built client. There is no silent mock fallback if a custom adapter fails.

Expected JSON:

```json
{
  "observations": [
    {
      "id": "example-epoch-1",
      "observedAt": "2025-05-15T00:00:00Z",
      "band": "demo-short",
      "isMock": true,
      "provenance": "Synthetic example only"
    }
  ]
}
```

`id` must be nonempty and unique, dates parseable (use ISO 8601 UTC), `isMock` boolean, and `provenance` a string. Returned bands must match the query. An empty observations array is supported. Provenance and `isMock` from a custom adapter are adapter claims, not independently verified by this app. The demo provider intentionally returns the same illustrative dates for any location; it does not simulate real sky coverage.

Before connecting a real SPHEREx service, verify access endpoints, authentication, release availability, coverage, channel definitions, licensing, CORS, and timestamp semantics against authoritative mission/archive documentation. Replace `BANDS` with verified channel metadata and adapt the provider accordingly. Add verified per-epoch image assets and an image-layer adapter before making playback change imagery. Comparison requires image registration, compatible flux units, PSF handling, uncertainty masks, and scientific validation.

## Aladin Lite and dependencies

Uses the official Aladin Lite npm integration (`import A`, await `A.init`, then `A.aladin`) and retains its attribution controls. The stable `aladin-lite@3.8.2` dependency is pinned in package.json and package-lock.json. Vite emits the dynamically imported engine as a local production asset; the package embeds its WASM as a data URL, so engine startup does not fetch JavaScript or WASM from the Aladin server. `VITE_ALADIN_SCRIPT_URL` is no longer used and can be removed from existing .env files. Restart the dev server after updating dependencies. Survey tiles, survey discovery, and optional catalog services remain external runtime dependencies and can fail independently of engine startup. Aladin Lite is LGPL-3.0-or-later; review upstream licenses and image attribution before redistribution or public deployment.

- [Aladin Lite integration documentation](https://cds-astro.github.io/aladin-lite/)
- [Vite guide](https://vite.dev/guide/)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)

## Verification scope

`npm test` checks the mock provider, validation, empty responses, sorting, band changes, and cancellation. `npm run build` verifies the production bundle. These checks do not establish remote atlas availability, browser WebGL support, or continued IRSA availability. SPHEREx tests cover captured official metadata, exact cube-frame selection, SIA request construction, exposure parsing, date conversion, and invalid responses. Manually check sky loading, coordinate navigation, mobile layout, keyboard controls, timeline playback, failed requests, and your adapter's empty results in the target browser before publishing.

## Local FITS sample test

The sky viewer opens the live SPHEREx mosaic by default. The Horsehead Nebula FITS sample remains available as a local fallback. Use **Image source** above the atlas to switch to the Galactic Center 2MASS J sample or return to the remote DSS2 reference sky. Each FITS image is served from `public/samples/` and parsed by Aladin's local WASM engine; no remote FITS conversion service is required. The viewer centers on each image's WCS coordinates. The files are copied into `dist/samples/` during production builds.

These are real public tutorial images, clearly labeled **not SPHEREx**. They cannot enter the SPHEREx investigation timeline and are not a same-field epoch pair for subtraction. RA/Dec inputs still navigate the atlas and can move away from a sample footprint; selecting another sample recenters the image. Download links and source attribution are shown beside the selector. Full original URLs, file sizes, and SHA-256 checksums are in `public/samples/provenance.json`.

Source: [Astropy data index](https://www.astropy.org/astropy-data/). Horsehead header credits STScI/MAST DSS; the second file is the Astropy 2MASS J Galactic Center sample.

## Landing page and guided tutorial

The single-page site opens on the Parallax landing page, using the charcoal and lavender palette, serif headlines, orbital illustration, and scroll-reactive starfield adapted from the supplied Planet X design. Navigation and calls to action lead to the existing explorer section without resetting its state.

The explorer keeps its desktop arrangement: coordinates and comparison controls on the left; sample selector and Aladin atlas on the right, followed by the timeline and provenance. Narrow layouts stack the same controls. The existing FITS loading, coordinate navigation, API abstraction, remain in place.

Use **Tutorial**, **Take a quick tour**, or **Guide me** for a six-step spotlight tour. Next/Back and the left/right arrow keys navigate; Escape or Skip closes it. Native modal focus containment keeps keyboard navigation inside the tour, and focus returns to the launcher on close. The tour does not change coordinates, selected images, bands, or playback settings.

The canvas starfield responds to pointer motion and accelerates with scroll. Reduced-motion preferences produce a static starfield and disable orbital motion and smooth scrolling. Animation pauses while the document is hidden. Fonts use local system and Georgia serif fallbacks; the landing page adds no external font or script dependency.

## Live SPHEREx integration

Official sources:

- [Introduction to SPHEREx spectral images](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/)
- [HiPS all-sky mosaic cube tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-hipscube/)
- [Archive access and SIA2 collections](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/)
- [IRSA cube viewer and metadata](https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/)

`src/api/spherex.js` fetches the cube's live `properties` file and reads all 102 central wavelength labels. Zero-based indices 50 and 51 are documented blank dichroic channels and disabled in the selector. The initial layer is index 62 (3.293 µm in the verified metadata). Aladin's frequency-coordinate mapping follows IRSA's own Aladin 3.8.2 viewer; its `setSliceNumber` method does not select the requested index reliably for this cube. The transport frequency is not presented as a physical channel wavelength.

The mosaic is a visualization product, not a single epoch or a source of calibrated photometry. Striping and missing coverage can occur. No epoch animation, subtraction, spectral extraction, or scientific flux measurement is implied. Source credit: NASA/SPHEREx, Caltech/IPAC.

Exposure search uses `https://irsa.ipac.caltech.edu/SIA` with `COLLECTION=spherex_dr1` or `spherex_qr3`, a 1 arcsecond circle at the applied RA/Dec, `RESPONSEFORMAT=TSV`, and `MAXREC=50`. This point-coverage search is independent of atlas FOV . Results are sorted by `t_min` (MJD converted to UTC); collection changes or new applied coordinates clear previous results. The returned subset is not guaranteed to contain the earliest 50 exposures. Files can be large and contain multiple extensions; download links preserve the original products. Deep-survey collections are not included. Citizen-science mode adds per-exposure rendering, described below.

Mosaic metadata and tiles load directly from IRSA without API keys. IRSA's SIA endpoint does not supply browser CORS headers, so exposure searches use the same-origin `/api/spherex-exposures` route. `server/spherex.js` validates coordinates and collection, fixes the upstream host, caps results at 50, and enforces a 25-second timeout. Vite mounts this route for dev/preview; `npm start` serves it with the production build. There is no general-purpose URL proxy. Remote availability requires internet access; errors and timeouts are shown with retry controls, and the local FITS sources remain selectable. No silent substitution of mock data occurs. Fixtures under `tests/fixtures/` were retrieved from IRSA on 2026-11-14 and are used only for tests, not as a live-data fallback.

## Citizen science: Explore → Mark → Submit → Review

The **Citizen science** panel reuses the existing Aladin viewer. Search IRSA, then choose **Add exposure to investigation** on an archive result. Use **Find more exposures / mosaic** to add further frames without losing markers. Select a frame, wait for it to load, click **Mark Object**, then click the object. Reposition by marking again, or remove the marker. Up to 12 original exposures can be included in a report. **Report candidate** opens the submission form. Motion reports require at least two distinct original observations at different UTC times.

`/community` shows public candidates with type filters, newest/most-reviewed sorting, pagination, review counts, agreement, and unsure counts. `/community/:id` reloads the exact stored source URLs, in the saved order, without querying the latest archive. Reviewers begin without the reporter's markers or description. They must load all original frames before reviewing; after submitting, they can reveal the original markers and see community statistics. Self-review and duplicate reviews are blocked by PostgreSQL RLS/constraints as well as the interface.

### Supabase setup

1. Use a dedicated Supabase project. Apply `supabase/migrations/20261114125621_citizen_science.sql` in its SQL Editor (once). The migration creates only Parallax's two tables, validation function, indexes, policies, and summary view. It deliberately fails on conflicting existing objects instead of replacing unrelated tables.
2. Enable **Anonymous Sign-Ins** in Authentication → Sign In / Providers. An anonymous identity is reused in the browser; clearing site data or switching browser profiles loses it. For public deployment, configure abuse controls for anonymous authentication in Supabase; enabling CAPTCHA also requires a CAPTCHA token flow, which is not included in this hackathon UI.
3. Set `VITE_SUPABASE_URL` to the project root (not `/rest/v1/`) and `VITE_SUPABASE_PUBLISHABLE_KEY` to its `sb_publishable_…` key. Copy `.env.example` to `.env.local`, then restart Vite or rebuild. Never use a secret or service-role key. The supplied project configuration is stored only in ignored `.env.local`.
4. Run `npm run dev`, or `npm run build` followed by `npm start`. The production server serves the community routes and fixed-origin image/search endpoints. Client assets use root-relative URLs; deploy at the domain root or configure corresponding routing/base paths for a subdirectory.

The migration grants public reads for the community's candidates and classifications; authenticated anonymous contributors may insert under their own UID. Clients have no UPDATE/DELETE grants, cannot set status or creation time, cannot review their own candidates, and cannot overwrite an earlier assessment. The `candidate_summary` view uses `security_invoker` and excludes unsure votes from agreement. With no definitive reviews it returns NULL, displayed as **Awaiting review**. Client-side hiding reduces incidental bias but is not a private/blinded research protocol: the community records are public.

### Image identity and scientific limits

- Real submissions accept only DR1/QR3 original spectral exposures, not the all-sky mosaic, demo timeline, DSS2, or tutorial samples. Original observation IDs, publisher IDs, raw SIA metadata, FITS observation timestamps, detector bands, wavelength bounds, processing versions, provenance URLs, marked celestial coordinates, and per-frame view centers/FOV are retained.
- `/api/spherex-image` downloads only from the fixed IRSA SPHEREx Level 2 path. It extracts the original float32 **IMAGE** extension as a primary FITS image, retaining pixels and WCS; it does not reproject, synthesize, subtract, or calibrate data. Current SPHEREx IMAGE extensions are 2040×2040; the endpoint reads an 18 MiB prefix, sufficient for these verified products, and fails if the complete science extension is not present. It caches at most three extracted images in memory.
- Aladin's `pix2world(x,y,'icrs')` converts a click in the loaded exposure projection. A separate TAN/SIP inverse WCS and finite-pixel check rejects clicks outside that exposure's actual image footprint. No background sky survey is displayed in exposure mode. An image SHA-256 is stored and checked on replay; a missing or changed source blocks marking/review instead of silently substituting data.
- Each image's visualization cuts are derived from its finite-pixel 1st and 99.5th percentiles (sampled for speed), and saved with the report. Images can have different display stretches; visual brightness alone is not calibrated photometry. The wavelength varies across each detector. Pixel quality flags, PSF matching, source identification, motion fitting, photometric calibration, and scientific vetting remain outside this MVP. Flags/variance remain available in the linked original MEF.
- Database validation enforces the exposure-metadata contract and rejects simulated/mosaic-shaped reports. It does not independently contact NASA or cryptographically attest every caller's scientific claims. Submitted candidates and votes remain user reports, never verified discoveries.
- No observation thumbnail is fabricated; the community cards use metadata, and investigation loads the original images.

### Tests

`npm test` includes real captured IRSA metadata parsing, FITS/TAN-SIP footprint tests, candidate validation, agreement math, and a PGlite PostgreSQL execution of the migration with two test identities. Database tests cover invalid provenance, ownership spoofing, self-review, duplicate votes, public reads, immutable status, and anonymous write denial. PGlite tests run entirely locally with test-only data; they do not write synthetic candidates to Supabase. There is no lint script in this repository; formatting uses the existing Prettier configuration.

Main additions: `src/citizen/` (workspace, report form, community routes, model/API); `src/lib/supabase.js`; `src/lib/fits.js`; `server/exposure.js`; `supabase/migrations/`; and citizen-science tests. Existing `SkyViewer`, `Timeline`, archive search, navigation, and server routing are extended rather than replaced.

### SPHEREx image rendering

Aladin Lite 3.8.2 renders these original TAN-SIP exposure headers blank. A browser worker now resamples a display-only copy from the original distorted pixel grid into the same undistorted TAN projection, using the original SIP coefficients and bilinear interpolation. Original FITS bytes, checksum, metadata, and the original WCS remain the basis for candidate provenance and valid-pixel marking. This display image is not a calibrated photometry product; quality flags are not masked. The Center image button restores the exposure footprint after panning away.
