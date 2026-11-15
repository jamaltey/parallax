# Citizen science: Explore → Mark → Submit → Review

[Back to Parallax](../README.md) · [Architecture](ARCHITECTURE.md) · [Data sources](DATA_SOURCES.md)

The **Spot something interesting?** panel reuses the existing Aladin viewer. Search IRSA, then choose **Open image** on an archive result. Use **Back to sky map / find images** to add further frames without losing markers. Select a frame, wait for it to load, click **Mark Object**, then click the object. Reposition by marking again, or remove the marker. Opened observations are cached in the browser for faster switching and timeline playback. Every personal marker is shown on every frame at its celestial RA/Dec: violet identifies the active frame's marker and cyan identifies markers made on other timeline frames. Each coordinate remains associated with its original observation for submission. Up to 12 original exposures can be included in a report. **Report candidate** opens the submission form. Motion reports require at least two distinct original observations at different UTC times.

With two or more timeline images, **Compare** selects reference A and comparison B. Overlay, blink, raw `B − A`, and normalized visual residuals are reproduced locally from the original saved observations, including on community investigations. Derived layers are investigation-only: return to **Original view** to place or confirm a marker. This ensures every submitted coordinate is checked against an original image's finite TAN-SIP footprint. Comparison settings and derived bytes are not stored in the database and do not replace observation IDs, timestamps, URLs, checksums, or reporter markers.

`/community` shows public candidates with type filters, newest/most-reviewed sorting, pagination, review counts, agreement, and unsure counts. `/community/:id` reloads the exact stored source URLs, in the saved order, without querying the latest archive. Reviewers begin without the reporter's markers or description. They must load all original frames before reviewing; after submitting, they can reveal the original markers and see community statistics. Self-review and duplicate reviews are blocked by PostgreSQL RLS/constraints as well as the interface.

### Supabase setup

1. Use a dedicated Supabase project. Apply [citizen science migration](../supabase/migrations/20261114125621_citizen_science.sql) in its SQL Editor (once). The migration creates only Parallax's two tables, validation function, indexes, policies, and summary view. It deliberately fails on conflicting existing objects instead of replacing unrelated tables.
2. Enable **Anonymous Sign-Ins** in Authentication → Sign In / Providers. An anonymous identity is reused in the browser; clearing site data or switching browser profiles loses it. For public deployment, configure abuse controls for anonymous authentication in Supabase; enabling CAPTCHA also requires a CAPTCHA token flow, which is not included in this hackathon UI.
3. Set `VITE_SUPABASE_URL` to the project root (not `/rest/v1/`) and `VITE_SUPABASE_PUBLISHABLE_KEY` to its `sb_publishable_…` key. Copy `.env.example` to `.env.local`, then restart Vite or rebuild. Never use a secret or service-role key. Keep project-specific configuration in ignored `.env.local`; do not commit it.
4. Run `npm run dev`, or build then use `npm start`. The explorer always calls the same-origin Node routes; Supabase configuration affects only Auth and citizen-science database calls. Saved candidates retain original IRSA URLs rather than deployment-specific proxy URLs.

The migration grants public reads for the community's candidates and classifications; authenticated anonymous contributors may insert under their own UID. Clients have no UPDATE/DELETE grants, cannot set status or creation time, cannot review their own candidates, and cannot overwrite an earlier assessment. The `candidate_summary` view uses `security_invoker` and excludes unsure votes from agreement. With no definitive reviews it returns NULL, displayed as **Awaiting review**. Client-side hiding reduces incidental bias but is not a private/blinded research protocol: the community records are public.

### Image identity

See [Data sources and scientific limits](DATA_SOURCES.md#image-identity-and-scientific-limits) for the preserved metadata, checksum checks, original-pixel footprint validation, and display resampling.

### Tests

`npm test` includes captured IRSA metadata parsing, FITS/TAN-SIP footprint tests, WCS-aligned comparison fixtures, Node Range and byte-identity tests, candidate validation, agreement math, and a PGlite PostgreSQL execution of the migration with two test identities. Comparison fixtures test movement, brightness sign, shifted/rotated/scaled/SIP grids, RA wraparound, overlap/NaN masks, normalization, stale jobs, and unchanged original checksums. Database tests cover invalid provenance, ownership spoofing, self-review, duplicate votes, public reads, immutable status, and anonymous write denial. Tests run locally and do not write synthetic candidates to Supabase. There is no lint script.

Main additions: `src/citizen/` (workspace, report form, community routes, model/API); `src/lib/supabase.js`; `src/lib/fits.js`; `server/exposure.js`; `supabase/migrations/`; and citizen-science tests. Existing `SkyViewer`, `Timeline`, archive search, navigation, and server routing are extended rather than replaced.

## Report and review contract

Reports contain a change type (`moving`, `brightness`, `transient`, or `artifact`), optional description of up to 2,000 characters, and low/medium/high confidence. One marker per exposure may be repositioned or removed before submission. Selected but unmarked frames are not submitted. Motion reports require distinct observation IDs as well as distinct timestamps, not merely two detector images from one observation.

`candidates` stores UUID identity and author, marked RA/Dec, first marked frame's view center and FOV, type, description, confidence, observation JSON, status, and creation time. `classifications` stores UUID identity, candidate and reviewer foreign keys, verdict, and creation time. JSON is limited to 1–12 observations and 200,000 bytes by database validation. Foreign keys cascade when the referenced user or candidate is deleted by an authorized administrator. Client writes remain insert-only.

Submission uses a stable candidate UUID so a retry after an ambiguous network response can recover the contributor's existing report. Reviews are unique per candidate and user. The UI handles missing configuration, authentication failures, duplicate reviews, unavailable observations, network failures, empty lists, and loading states.

Agreement is `agree / (agree + disagree) × 100`. Unsure votes count toward total reviews but are excluded from that percentage and shown separately. With no definitive votes, the UI says **Awaiting review**. There is no automatic promotion to a scientific discovery: permitted database statuses are `unreviewed` and `needs_investigation`; contributors cannot assign either status directly.

The investigation page hides reporter type, description, confidence, markers, and statistics until the reviewer submits (the author can see their own details). The public listing already exposes type, description, and statistics. This reduces incidental bias inside the investigation view; it is not blinded research. Reviewers can place temporary personal markers, but only their verdict is persisted. Source images are fetched again from stored URLs and compared with the saved extracted-image checksum; the platform does not archive immutable image copies.

## Verification

Automated tests execute the migration in local PGlite with separate identities; they are not a live hosted Supabase end-to-end test. Original-image rendering and marking were checked earlier in a browser. This cleanup does not change the schema or RLS. A complete two-user submission/review run against a deployed Render build must still be established before public presentation.

Before presenting a configured deployment:

1. Open a real archive image, mark it, switch frames, and confirm marker persistence. Mark a second observation at a different time for a motion report.
2. Select those frames as A/B. Verify the aligned opacity endpoints, blink, raw/normalized difference, overlap mask, swap sign, sensitivity control, center/zoom preservation, and return to Original view.
3. Submit and reopen the candidate from Community; confirm exact image sequence, views, metadata, and local comparison reproduction.
4. Use a separate browser profile to obtain a different anonymous identity. Load every saved frame and submit an assessment.
5. Confirm agreement/unsure counts and marker reveal. Confirm self-review and duplicate votes are refused.
6. Check missing images, incompatible units, no overlap, timeouts, processing failures, and authentication failures. Do not insert synthetic training candidates into the real database.

Anonymous identity is tied to browser storage, not a verified person; multiple profiles can obtain different identities. Moderation, stronger abuse prevention, account recovery, and CAPTCHA UI are future work. No thumbnail is generated for community cards.
