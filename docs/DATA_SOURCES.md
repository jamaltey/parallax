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

## Overlay and difference imaging

Comparison uses two original timeline observations. Image A defines an undistorted TAN output grid; it does **not** assume matching dimensions, pointing, scale, rotation, or SIP distortion. A Web Worker maps every output pixel through celestial ICRS coordinates into both original grids and bilinearly samples their float32 `IMAGE` pixels. Pixels outside either footprint, with failed SIP inversion, or with non-finite contributing samples remain NaN. Pairs with fewer than 0.01% valid common-grid pixels (minimum four for unit fixtures) are rejected as having no meaningful overlap.

Overlay displays the aligned A and B FITS layers with identical overlap-derived 1st/99.5th percentile cuts. At 0% only A is visible; at 100% opaque B covers A. Blink alternates the aligned layers. The current release does not include the optional cyan/magenta two-color composite.

Difference follows `D = B_aligned − A_aligned`:

- **Raw B − A** is available only when both FITS files declare the same nonempty `BUNIT`. It preserves that declared unit but is labeled exploratory/uncalibrated.
- **Normalized visual** subtracts each overlap median and divides by its robust MAD scale. It is dimensionless and handles constant/near-zero-scale images with a documented numerical floor.

Both use a zero-centered blue-to-red diverging palette. Blue/negative means brighter in A; red/positive means brighter in B. Display sensitivity narrows or widens symmetric robust cuts without changing the derived pixel array. Different detector bands or archive wavelength bounds produce warnings. Even matching D1–D6 labels and nominal bounds do not establish per-pixel wavelength equivalence because SPHEREx wavelength varies across a detector.

These tools do not apply quality flags, uncertainty weighting, background models beyond the optional median normalization, PSF matching, photometric scaling, source extraction, or motion fitting. A positive/negative residual pair can come from motion, but also wavelength response, brightness variability, noise, PSF changes, or artifacts. Derived FITS layers are local display products, are not offered as original NASA observations, and never replace stored IRSA provenance.

## Local FITS sample test

The sky viewer opens the live SPHEREx mosaic by default. The Horsehead Nebula FITS sample remains available as a local fallback. Use **Change sky map** above the atlas to switch to the Galactic Center 2MASS J sample or return to the remote DSS2 reference sky. Each FITS image is served from `public/samples/` and parsed by Aladin's local WASM engine; no remote FITS conversion service is required. The viewer centers on each image's WCS coordinates. The files are copied into `dist/samples/` during production builds.

These are real public tutorial images, clearly labeled **not SPHEREx**. They cannot enter the SPHEREx investigation timeline and are not a same-field epoch pair for subtraction. RA/Dec inputs still navigate the atlas and can move away from a sample footprint; selecting another sample recenters the image. Download links and source attribution are shown beside the selector. Full original URLs, file sizes, and SHA-256 checksums are in `public/samples/provenance.json`.

Source: [Astropy data index](https://www.astropy.org/astropy-data/). Horsehead header credits STScI/MAST DSS; the second file is the Astropy 2MASS J Galactic Center sample.

## Operational limits and interpretation

The image endpoint allows only original IRSA DR1/QR3 Level 2 paths, rejects redirects, and has a 60-second upstream timeout. The browser allows 65 seconds for loading and display preparation. Large products or a slow archive may time out; retry rather than substitute another image. The process-local cache is lost on restart and is not shared between scaled instances. The 18 MiB prefix strategy is tailored to verified products, not a general FITS archive reader.

The representative DR1 source was 60,157,440 bytes; its extracted IMAGE-only FITS was 16,672,320 bytes with SHA-256 `aee31dfc60b2e2a1fdf46a14449e1101a422ec4b7d79190aea64be63258192f9`. The retained Node Range path must continue producing that exact result. See the [historical serverless benchmark](ARCHITECTURE.md#serverless-experiment-and-production-decision) for the cross-runtime equivalence and production decision.

Transient IRSA HTTP 502 responses were observed during live testing. Retry visibly; do not change the scientific query or introduce synthetic results in response to an archive failure.

Mosaic brightness uses a magma false-color palette, not visible-light color. Original exposures use an asinh display stretch with sampled percentile cuts, saved per marked frame. Do not interpret brightness changes across different detectors, wavelengths, stretches, or image artifacts as physical variability without further analysis. The comparison worker performs cross-epoch WCS registration, but not PSF matching or calibrated photometry.

The viewer can look up the nearest known SIMBAD object around a clicked ICRS position. Because the main CDS services are currently degraded, Parallax queries the official CfA Harvard mirror first and uses the IDIA South Africa mirror as a fallback. A visible source can still have no SIMBAD match, and proximity does not establish that the catalog record and the SPHEREx source are the same physical object.

The implemented workflow supports human candidate reporting, WCS-aligned exploratory comparison, mirrored SIMBAD lookup, and community assessment. Broad catalog cross-matching, source extraction, spectral extraction, calibrated photometry, validated scientific subtraction, automated motion fitting, and Planet X discovery/confirmation are not implemented. A catalog match, residual, moving point, or high agreement score does not establish a new planet.

Official challenge: [Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/). The URL was corroborated by a challenge index; the official page returned HTTP 502 during this documentation pass on 2026-11-14, so its full current text was not reverified. Mission data attribution remains NASA/SPHEREx · Caltech/IPAC IRSA. Parallax is an independent team project, with no implied NASA endorsement.
