# Parallax

> **A different perspective on a changing universe.**

Parallax is an interactive astronomical exploration and citizen-science platform built by **team Delta Cephei** for the **NASA International Space Apps Challenge 2026 — “Planet X and SPHEREx.”** It makes real infrared observations approachable: explore the sky, compare original observations, mark an interesting change, and invite the community to investigate it.

**Live demo:** _add Render URL after deployment_ · [Official challenge](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/) · [Technical architecture](docs/ARCHITECTURE.md)

<!-- Screenshot placeholder: replace with a current Parallax explorer/community image before judging. -->

## The problem and our solution

SPHEREx repeatedly maps the sky across 102 near-infrared channels. The archive is scientifically rich, but its scale and specialist formats make public investigation difficult. Parallax turns those resources into a guided workflow:

**Explore → Mark Object → Submit Candidate → Community Review**

Every real candidate retains the original IRSA observation IDs, timestamps, detector bands, source URLs, coordinates, view state, and extracted-image checksum so another person can revisit the same evidence.

## Implemented today

| Area                  | Working functionality                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Real SPHEREx data     | Live Caltech/IPAC IRSA all-sky mosaic plus DR1 and QR3 original-exposure searches; no synthetic fallback                           |
| Infrared exploration  | 102-channel mosaic metadata, 100 selectable non-blank wavelength layers, RA/Dec navigation, and FOV control                        |
| Original observations | Strictly validated Level 2 FITS retrieval, timeline playback, browser Web Worker display reprojection, and provenance checks       |
| Citizen science       | Per-frame celestial markers, candidate reports, anonymous Supabase authentication, saved investigations, and community reviews     |
| Scientific safeguards | Original source identity and checksum validation, self-review/duplicate-review prevention, RLS, and explicit candidate disclaimers |

Community agreement is a public assessment, **not scientific confirmation or the probability that an object is Planet X**.

## Run locally

Requires Node.js 22.12–24, npm, internet access, WebGL2, and a modern browser.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The Vite development server uses the same-origin Node API routes. For a production-equivalent run:

```sh
npm run build
HOST=0.0.0.0 PORT=3000 npm start
```

Exploration does not require a Supabase session. To enable submissions and reviews, apply the included migration, enable Anonymous Sign-Ins, and configure:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Never put a secret or service-role key in `VITE_*` variables. See [Citizen science setup](docs/CITIZEN_SCIENCE.md).

## Production architecture

Parallax is supported as one **Render Node.js Web Service**:

- React 19, Vite 7, Tailwind CSS 4, and Aladin Lite 3.8.2 in the browser.
- Node.js serves `dist`, SPA routes, IRSA archive searches, and bounded FITS extraction.
- Supabase provides only anonymous Auth and PostgreSQL persistence/RLS for citizen science.
- Browser Web Workers prepare display-only TAN/SIP reprojections without changing stored scientific pixels.

The repository includes [render.yaml](render.yaml). Use `npm ci && npm run build` as the build command and `npm start` as the start command. Add the two Supabase variables above in Render. No production deployment URL is claimed yet.

## Data and scientific limits

Mission data comes from **NASA/SPHEREx via Caltech/IPAC IRSA**: the [all-sky wavelength cube](https://caltech-ipac.github.io/irsa-tutorials/spherex-hipscube/) and [original spectral images](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/). Included DSS/2MASS tutorial images are clearly labeled and cannot be submitted as SPHEREx candidates.

The mosaic combines observation times, colors represent infrared brightness rather than visible color, and individual exposures may differ in wavelength and display stretch. **Difference imaging and overlay are UI placeholders.** Calibrated photometry, spectral extraction, automated classification, motion fitting, and Planet X discovery or verification are not implemented.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — runtime design, Node endpoints, Render deployment, tests, and the serverless benchmark decision.
- [Data sources](docs/DATA_SOURCES.md) — archive contracts, provenance, FITS processing, rendering, and scientific limitations.
- [Citizen science](docs/CITIZEN_SCIENCE.md) — Auth/database setup, report/review contract, RLS, and verification checklist.

## Team and roadmap

**Delta Cephei** · _Member names and roles to be added._ Parallax is an independent project; no NASA endorsement is implied.

Next steps include scientifically validated registration/subtraction, quality-mask and PSF handling, richer archive filtering, moderation, stronger contributor identity controls, and hosted end-to-end verification.
