# Parallax

**A different perspective on a changing universe.**

Parallax is an interactive astronomical exploration and citizen science platform developed by **team Delta Cephei** for the **NASA International Space Apps Challenge 2026 — “Planet X and SPHEREx.”** Explore real infrared observations, mark changes, and investigate candidates together.

[Official challenge](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/) · [Deployment and architecture](docs/ARCHITECTURE.md)

## Why Parallax?

Spotting small changes among countless points of light is difficult, and astronomical archives can be intimidating.

Parallax turns exploration into a guided workflow: **Explore → Mark Object → Submit Candidate → Community Review.** Each report preserves observation identities and provenance so others can revisit the evidence.

## What works today

| Feature                      | Implemented experience                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Real SPHEREx integration** | Live IRSA all-sky mosaic and DR1/QR3 original-exposure search; no synthetic fallback.                                                      |
| **Infrared exploration**     | Explore SPHEREx's 102-channel infrared mosaic, with 100 selectable wavelength layers; navigate by sky coordinates and zoom.                |
| **Original FITS timeline**   | Open exposures, step through dates, and play a selected sequence. Display distortion correction makes the original images viewable.        |
| **Object marking**           | Record celestial coordinates, reposition/remove markers, and retain them when switching frames.                                            |
| **Citizen science**          | Submit a type, description, and confidence through Supabase anonymous authentication; preserve original metadata and image checksums.      |
| **Community investigation**  | Filter candidates, reopen saved observations, and submit agree/disagree/unsure assessments. Self-review and duplicate reviews are blocked. |

Persistence requires Supabase. Motion reports require two observation times. Community agreement excludes unsure votes and **is not scientific confirmation**.

## Try it locally

Requires **Node.js 22.12+**, npm, internet access, and a WebGL2-capable browser.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open Vite’s local URL. Choose **Open image → Mark Object**; add images to build a timeline. Exploration needs no API key.

Local development defaults to the preserved Node API. Production can use either that server or the new Supabase Edge Functions transport.

### Enable contributions

1. Apply the [Supabase migration](supabase/migrations/20261114125621_citizen_science.sql) once in your project's SQL Editor.
2. Enable **Anonymous Sign-Ins** in Supabase Authentication.
3. Set these values in `.env.local`, then restart Vite or rebuild:

```dotenv
VITE_SPHEREX_API_MODE=node
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Use the project root URL and a publishable key—never a secret or service-role key. [Full setup and review policies →](docs/CITIZEN_SCIENCE.md)

## Technology & data

**React 19 · Vite 7 · Tailwind CSS 4 · Aladin Lite 3.8.2 · Web Workers · Supabase Edge Functions/Auth/PostgreSQL · Node.js fallback · Vercel-ready static frontend**

Mission imagery comes from **NASA/SPHEREx via Caltech/IPAC IRSA**: the [infrared mosaic](https://caltech-ipac.github.io/irsa-tutorials/spherex-hipscube/) and [original spectral observations](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/). Separate DSS/2MASS reference images are labeled and excluded from SPHEREx candidate submissions.

## Scientific scope & next steps

Colors represent infrared brightness, not visible-light colors. The mosaic combines observation times; individual exposures can differ in wavelength and display stretch. Reports are **candidates needing further investigation**, not discoveries of Planet X.

**Overlay and difference imaging are UI placeholders.** Calibrated photometry, spectral extraction, automated discovery, and scientific verification are not implemented.

Future work: validated image registration/subtraction, quality-mask and PSF handling, richer archive filtering, and stronger moderation and contributor identity controls.

## Team & documentation

**Delta Cephei** · _Member names and roles to be added._ Independent project; no NASA endorsement implied.

- [Architecture](docs/ARCHITECTURE.md): components, deployment, tests, and legacy adapters.
- [Data sources](docs/DATA_SOURCES.md): provenance, FITS rendering, and scientific limits.
- [Citizen science](docs/CITIZEN_SCIENCE.md): workflow, database policies, and verification checklist.

`npm test` covers data contracts, display conversion, and local database policies. A two-user hosted Supabase workflow still needs end-to-end verification; see the checklist before presenting a deployment.

## Deployment status

Both public Supabase Edge Functions are deployed. Hosted FITS extraction passed the representative 16 MiB checksum test, and controlled DR1/QR3 archive searches passed through both backends. However, three concurrent FITS requests exceeded the Edge worker's memory limit, while the Node cache served the same warmed requests successfully. **Keep Node mode for production for now.** Vercel and the complete two-user workflow have not been deployed or verified. [Deployment details and benchmark →](docs/ARCHITECTURE.md#production-decision)
