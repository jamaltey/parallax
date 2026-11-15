# Parallax public API v1

[Back to Parallax](../README.md) · [Architecture](ARCHITECTURE.md) · [Citizen science](CITIZEN_SCIENCE.md) · [Data sources](DATA_SOURCES.md)

The API provides read-only programmatic access to Parallax community candidate reports, saved original-observation provenance, and community review counts. It does not reproduce the NASA archive search API and does not provide bulk FITS downloads.

**Production base URL:** `https://parallax.dcephei.earth/api/v1`

The production URL serves this API only after the revision containing `server/public-api.js` is deployed. Local Vite and production-equivalent Node runs use the same paths. No account or API key is required.

> Parallax candidate reports are community-generated and have not been independently scientifically validated. Community agreement does not constitute confirmation of an astronomical discovery. NASA does not endorse or validate Parallax reports.

## Endpoints

### `GET /candidates`

Returns an envelope containing `data`, `pagination`, and a scientific disclaimer in `meta`.

| Parameter       | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `limit`         | Integer from 1–100; default 20                                                |
| `offset`        | Non-negative integer; default 0                                               |
| `type`          | `moving`, `brightness`, `transient`, or `artifact`                            |
| `status`        | `unreviewed` or `needs_investigation`                                         |
| `min_agreement` | Number from 0–100; candidates with undefined agreement are excluded           |
| `min_reviews`   | Non-negative integer                                                          |
| `sort`          | `newest`, `oldest`, `most_reviewed`, or `highest_agreement`; default `newest` |

All ordering includes candidate UUID as a final stable tie-breaker. Celestial `ra`, `dec`, and `radius` filtering is intentionally not implemented in v1. The current database has no spherical-query interface; accepting these parameters with naïve planar arithmetic would mishandle RA wraparound and angular distance. Unknown or repeated parameters return HTTP 400.

Each list item contains:

- `id`, `type`, `description`, `confidence`, `status`, and `created_at` from the report.
- `report_position`, the candidate's representative submitted RA/Dec in ICRS decimal degrees. It is not a replacement for the per-observation marks in detail responses.
- `observation_count`, plus the earliest and latest valid saved observation timestamps.
- `review_statistics`: total, agree, disagree, unsure, and `agreement_percent`. Agreement is `agree / (agree + disagree) × 100`; unsure is excluded. When there are no definitive votes, agreement is `null`, not 0.
- `url`, the public Parallax investigation page.

```sh
curl "https://parallax.dcephei.earth/api/v1/candidates?limit=10&min_reviews=2&sort=most_reviewed"
```

Results always come from current public rows. The documentation does not include a fabricated live response.

### `GET /candidates/CANDIDATE_UUID`

Replace `CANDIDATE_UUID` with an ID obtained from the list endpoint. Invalid UUIDs return 400 and missing/non-public records return 404.

In addition to the list fields, detail responses contain:

- `sky_region`: saved ICRS center and field of view in degrees.
- `observations`, in the exact submitted order. Every entry is explicitly serialized with its archive record and observation IDs, original IRSA FITS URL, collection, detector band, UTC timestamp, wavelength bounds in meters, processing version, marked ICRS position, saved view, extracted-FITS SHA-256/format version, optional archive MJD bounds, and source provenance.
- `data_role: "original_observation"`, distinguishing these inputs from derived Overlay or Difference views. Derived pixels and comparison settings are not stored or returned.

The serializer never returns Supabase user IDs, reviewer IDs, authentication data, raw archive metadata blobs, or proxy URLs. The original IRSA URL is preserved only when it uses the official IRSA host.

```sh
curl "https://parallax.dcephei.earth/api/v1/candidates/CANDIDATE_UUID"
```

### `GET /stats`

Returns actual aggregate counts for total candidates, total classifications, candidates with/without reviews, and candidates grouped by the four current report types. Counts describe participation only; they are not confirmed-object counts or a global scientific score. Contributor counts are deliberately omitted.

Statistics may be cached in one Node process for up to 30 seconds and include `generated_at`. They are never cached indefinitely.

## JavaScript and Python

```js
const response = await fetch('https://parallax.dcephei.earth/api/v1/candidates?limit=10');
if (!response.ok) throw new Error(`API error: ${response.status}`);
const result = await response.json();
console.log(result.data);
```

```python
import requests

response = requests.get(
    "https://parallax.dcephei.earth/api/v1/candidates",
    params={"limit": 10},
    timeout=15,
)
response.raise_for_status()
for candidate in response.json()["data"]:
    print(candidate)
```

## Errors, CORS, and limits

Errors use one shape:

```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "limit must be an integer between 1 and 100."
  }
}
```

The API supports `GET` and `OPTIONS`, returns JSON UTF-8 with `nosniff`, and allows public cross-origin reads (`Access-Control-Allow-Origin: *`). CORS is not authentication or abuse prevention. Other methods return 405; unknown v1 endpoints return a JSON 404; bounded upstream calls return 503/504 without internal database details.

The single-process rate limiter currently permits 60 GET requests per client per minute and returns 429 with `Retry-After`. Its bounded map keeps at most 2,000 client entries and expires windows. It uses the final `X-Forwarded-For` address only when the direct peer is loopback/private, as expected behind Render; otherwise it ignores forwarding headers and uses the socket address. This avoids trusting an arbitrary forwarding header on a direct public connection, but remains a lightweight—not distributed—quota and resets on restart or scale-out. Public limits may change, and platform monitoring remains necessary.

## Database access and privacy

The Node server uses the existing Supabase project root and `VITE_SUPABASE_PUBLISHABLE_KEY`; it never uses a service-role or secret key. Queries run as the public role and remain subject to table grants and RLS. The `candidate_summary` view is `security_invoker=true`.

The database view itself currently selects all candidate columns, including the contributor's Supabase UUID, and the underlying `candidates` and `classifications` tables have public read policies. The API's explicit projection/serializer prevents those identifiers appearing in API responses, but response filtering does **not** change that underlying database-level exposure. Reducing it requires a separately reviewed schema/RLS migration and is not silently claimed here.

No public write endpoints exist. Submission and review continue through authenticated anonymous Supabase sessions and the existing ownership/self-review constraints.

## Attribution, reuse, and scientific boundaries

Original observations come from NASA/SPHEREx via Caltech/IPAC IRSA; follow each `original_fits_url` and the [IRSA SPHEREx archive](https://irsa.ipac.caltech.edu/Missions/spherex.html) for archive attribution and applicable terms. Candidate descriptions, positions, and classifications are community-generated Parallax content. No community data license has yet been established, so this API does not claim an open-content license or permission to relicense submissions.

Community reports are candidates needing further investigation. Agreement is not NASA validation, scientific confirmation, the probability that an object is Planet X, or evidence of a discovery by itself.
