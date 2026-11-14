# Data sources & scientific integrity

[Back to Parallax](../README.md) · [Architecture](ARCHITECTURE.md) · [Citizen science](CITIZEN_SCIENCE.md)

## Live SPHEREx integration

Official sources:

- [Introduction to SPHEREx spectral images](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/)
- [HiPS all-sky mosaic cube tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-hipscube/)
- [Archive access and SIA2 collections](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/)
- [IRSA cube viewer and metadata](https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/)

`src/api/spherex.js` fetches the cube's live `properties` file and reads all 102 central wavelength labels. Zero-based indices 50 and 51 are documented blank dichroic channels and disabled in the selector. The initial layer is index 62 (3.293 µm in the verified metadata). Aladin's frequency-coordinate mapping follows IRSA's own Aladin 3.8.2 viewer; its `setSliceNumber` method does not select the requested index reliably for this cube. The transport frequency is not presented as a physical channel wavelength.

The mosaic is a visualization product, not a single epoch or a source of calibrated photometry. Striping and missing coverage can occur. Wavelength switching in this mosaic is not time animation. It does not provide subtraction, spectral extraction, or scientific flux measurement; the separate original-exposure timeline switches actual observations. Source credit: NASA/SPHEREx, Caltech/IPAC.

Exposure search uses `https://irsa.ipac.caltech.edu/SIA` with `COLLECTION=spherex_dr1` or `spherex_qr3`, a 1 arcsecond circle at the applied RA/Dec, `RESPONSEFORMAT=TSV`, and `MAXREC=50`. This point-coverage search is independent of atlas FOV. Results are sorted by `t_min` (MJD converted to UTC); collection changes or new applied coordinates clear previous results. The returned subset is not guaranteed to contain the earliest 50 exposures. Files can be large and contain multiple extensions; download links preserve the original products. Deep-survey collections are not included. Citizen-science mode adds per-exposure rendering, described below. Results are sorted before display; the investigation sequence preserves the order in which users add images.

Mosaic metadata and tiles load directly from IRSA without API keys. IRSA's SIA endpoint does not supply browser CORS headers, so archive searches use the same-origin Node route. It uses the same validated `archiveSearchUrl()` contract as the browser, fixes the upstream host, caps results at 50, and enforces a 25-second timeout. There is no general-purpose URL proxy or silent mock fallback. Fixtures under `tests/fixtures/` are test data, never a live-data substitute.

## Image identity and scientific limits

- Real submissions accept only DR1/QR3 original spectral exposures, not the all-sky mosaic, demo timeline, DSS2, or tutorial samples. Original observation IDs, publisher IDs, raw SIA metadata, FITS observation timestamps, detector bands, wavelength bounds, processing versions, provenance URLs, marked celestial coordinates, and per-frame view centers/FOV are retained.
- The Node `/api/spherex-image` route accepts only fixed IRSA SPHEREx Level 2 paths. `extractScienceImage()` creates a primary FITS file from the original float32 **IMAGE** extension while retaining pixel bytes and WCS cards. Current verified IMAGE extensions are 2040×2040. The route requests the first 18 MiB with HTTP Range, validates `206 Content-Range`, handles a `200` fallback, and fails if the complete science extension is absent. It keeps a bounded three-image memory cache.
- Aladin's `pix2world(x,y,'icrs')` converts a click in the loaded exposure projection. A separate TAN/SIP inverse WCS and finite-pixel check rejects clicks outside that exposure's actual image footprint. No background sky survey is displayed in exposure mode. A SHA-256 of the extracted IMAGE-only FITS buffer (before display resampling, not the full original multi-extension download) is stored and checked on replay; a missing or changed source blocks marking/review instead of silently substituting data.
- Each image's visualization cuts are derived from its finite-pixel 1st and 99.5th percentiles (sampled for speed), and saved with the report. Images can have different display stretches; visual brightness alone is not calibrated photometry. The wavelength varies across each detector. Pixel quality flags, PSF matching, source identification, motion fitting, photometric calibration, and scientific vetting remain outside this MVP. Flags/variance remain available in the linked original MEF.
- Database validation enforces the exposure-metadata contract and rejects simulated/mosaic-shaped reports. It does not independently contact NASA or cryptographically attest every caller's scientific claims. Submitted candidates and votes remain user reports, never verified discoveries.
- No observation thumbnail is fabricated; the community cards use metadata, and investigation loads the original images.

## SPHEREx image rendering

Aladin Lite 3.8.2 renders these original TAN-SIP exposure headers blank. A browser worker now resamples a display-only copy from the original distorted pixel grid into the same undistorted TAN projection, using the original SIP coefficients and bilinear interpolation. Original FITS bytes, checksum, metadata, and the original WCS remain the basis for candidate provenance and valid-pixel marking. This display image is not a calibrated photometry product; quality flags are not masked. The Center image button restores the exposure footprint after panning away.

## Local FITS sample test

The sky viewer opens the live SPHEREx mosaic by default. The Horsehead Nebula FITS sample remains available as a local fallback. Use **Change sky map** above the atlas to switch to the Galactic Center 2MASS J sample or return to the remote DSS2 reference sky. Each FITS image is served from `public/samples/` and parsed by Aladin's local WASM engine; no remote FITS conversion service is required. The viewer centers on each image's WCS coordinates. The files are copied into `dist/samples/` during production builds.

These are real public tutorial images, clearly labeled **not SPHEREx**. They cannot enter the SPHEREx investigation timeline and are not a same-field epoch pair for subtraction. RA/Dec inputs still navigate the atlas and can move away from a sample footprint; selecting another sample recenters the image. Download links and source attribution are shown beside the selector. Full original URLs, file sizes, and SHA-256 checksums are in `public/samples/provenance.json`.

Source: [Astropy data index](https://www.astropy.org/astropy-data/). Horsehead header credits STScI/MAST DSS; the second file is the Astropy 2MASS J Galactic Center sample.

## Operational limits and interpretation

The image endpoint allows only original IRSA DR1/QR3 Level 2 paths, rejects redirects, and has a 60-second upstream timeout. The browser allows 65 seconds for loading and display preparation. Large products or a slow archive may time out; retry rather than substitute another image. The process-local cache is lost on restart and is not shared between scaled instances. The 18 MiB prefix strategy is tailored to verified products, not a general FITS archive reader.

The representative DR1 source was 60,157,440 bytes; its extracted IMAGE-only FITS was 16,672,320 bytes with SHA-256 `aee31dfc60b2e2a1fdf46a14449e1101a422ec4b7d79190aea64be63258192f9`. The retained Node Range path must continue producing that exact result. See the [historical serverless benchmark](ARCHITECTURE.md#serverless-experiment-and-production-decision) for the cross-runtime equivalence and production decision.

Transient IRSA HTTP 502 responses were observed during live testing. Retry visibly; do not change the scientific query or introduce synthetic results in response to an archive failure.

Mosaic brightness uses a magma false-color palette, not visible-light color. Original exposures use an asinh display stretch with sampled percentile cuts, saved per marked frame. Do not interpret brightness changes across different detectors, wavelengths, stretches, or image artifacts as physical variability without further analysis. Display SIP correction is not cross-epoch image registration, PSF matching, or calibrated photometry.

The implemented workflow supports human candidate reporting and community assessment. Difference imaging and overlay are interface placeholders. Spectral extraction, calibrated photometry, automated object identification, motion fitting, catalog cross-matching, and Planet X discovery/confirmation are not implemented. A moving point or a high agreement score does not establish a new planet.

Official challenge: [Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/). The URL was corroborated by a challenge index; the official page returned HTTP 502 during this documentation pass on 2026-11-14, so its full current text was not reverified. Mission data attribution remains NASA/SPHEREx · Caltech/IPAC IRSA. Parallax is an independent team project, with no implied NASA endorsement.
