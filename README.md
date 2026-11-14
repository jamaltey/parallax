# Parallax

Runnable React + Vite + Tailwind starter for a public sky explorer inspired by the NASA Space Apps SPHEREx challenge. Independent prototype; no NASA affiliation or endorsement implied.

**Live SPHEREx resources are connected.** The atlas opens the official IRSA SPHEREx DR1 all-sky HiPS mosaic with wavelength selection from live metadata. An archive search retrieves real DR1 or QR3 wide-survey spectral exposures and original FITS download links for the applied coordinates. The separate observation timeline and three demo band groups remain synthetic; they do not control these mission images. Difference and overlay remain UI placeholders.

## Run

Use Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open the local URL printed by Vite. The default configuration works without an API key. Aladin JavaScript and its embedded WebAssembly engine are bundled locally from the pinned npm package. A browser with WebGL2 is required. Remote sky tiles and optional catalog services still require internet access; bundling the engine does not make the atlas an offline sky viewer. If engine initialization fails, the app shows a viewer error; mock metadata controls remain usable.

```sh
npm test
npm run build
npm run preview
```

The production output is `dist/`. Run `npm start` to serve the production build and the archive API (default http://127.0.0.1:3000). Set `HOST=0.0.0.0` and `PORT` as appropriate for your deployment, with HTTPS at your hosting layer. A static-only deployment supports the mosaic and local samples but needs the `/api/spherex-exposures` server route for exposure searches. `base: './'` supports subdirectory hosting; serve through HTTP rather than opening index.html as a file. The ZIP includes source and the npm lockfile, excluding dependencies and generated output.

## Explore

- Enter ICRS RA [0, 360), Dec [−90, 90], and FOV [0.01, 180] in decimal degrees, then apply.
- Choose a real SPHEREx wavelength above the atlas, or use Image source to select a local FITS sample or DSS2.
- Select DR1 or QR3 and click **Find SPHEREx exposures** for real archive records at your applied RA/Dec.
- Choose one of three illustrative demo band groups. They are not actual SPHEREx channel IDs or wavelength definitions.
- Scrub, step, play/pause, or adjust timeline speed. Playback loops through metadata, not images.
- Refresh to fetch the current coordinates and band again. Requests are cancelled when a query changes; stale responses are ignored.
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

## Replace the mock provider

The adapter boundary is `getObservations(query, { signal })`. It returns chronologically sorted records and defaults to `mock`. This adapter controls only the demo/custom timeline; live IRSA resources use the separate `src/api/spherex.js` module.

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

These are real public tutorial images, clearly labeled **not SPHEREx**. They are independent of the mock observation timeline and demo bands, and are not a same-field epoch pair for subtraction. RA/Dec inputs still navigate the atlas and can move away from a sample footprint; selecting another sample recenters the image. Download links and source attribution are shown beside the selector. Full original URLs, file sizes, and SHA-256 checksums are in `public/samples/provenance.json`.

Source: [Astropy data index](https://www.astropy.org/astropy-data/). Horsehead header credits STScI/MAST DSS; the second file is the Astropy 2MASS J Galactic Center sample.

## Landing page and guided tutorial

The single-page site opens on the Parallax landing page, using the charcoal and lavender palette, serif headlines, orbital illustration, and scroll-reactive starfield adapted from the supplied Planet X design. Navigation and calls to action lead to the existing explorer section without resetting its state.

The explorer keeps its desktop arrangement: coordinates, demo bands, and comparison controls on the left; sample selector and Aladin atlas on the right, followed by the timeline and provenance. Narrow layouts stack the same controls. The existing FITS loading, coordinate navigation, API abstraction, and mock labels remain in place.

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

Exposure search uses `https://irsa.ipac.caltech.edu/SIA` with `COLLECTION=spherex_dr1` or `spherex_qr3`, a 1 arcsecond circle at the applied RA/Dec, `RESPONSEFORMAT=TSV`, and `MAXREC=50`. This point-coverage search is independent of atlas FOV and the demo bands. Results are sorted by `t_min` (MJD converted to UTC); collection changes or new applied coordinates clear previous results. The returned subset is not guaranteed to contain the earliest 50 exposures. Files can be large and contain multiple extensions; download links preserve the original products. Deep-survey collections and per-exposure rendering are not included in this integration.

Mosaic metadata and tiles load directly from IRSA without API keys. IRSA's SIA endpoint does not supply browser CORS headers, so exposure searches use the same-origin `/api/spherex-exposures` route. `server/spherex.js` validates coordinates and collection, fixes the upstream host, caps results at 50, and enforces a 25-second timeout. Vite mounts this route for dev/preview; `npm start` serves it with the production build. There is no general-purpose URL proxy. Remote availability requires internet access; errors and timeouts are shown with retry controls, and the local FITS sources remain selectable. No silent substitution of mock data occurs. Fixtures under `tests/fixtures/` were retrieved from IRSA on 2026-11-14 and are used only for tests, not as a live-data fallback.
