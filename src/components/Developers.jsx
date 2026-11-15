import { useMemo, useState } from 'react';
import Starfield from './Starfield';

const BASE_URL = 'https://parallax.dcephei.earth/api/v1';
const panel = 'rounded-xl border border-white/10 bg-[#141418] p-5 sm:p-7';
const code =
  'overflow-x-auto rounded-lg border border-white/10 bg-[#0b0b0e] p-4 text-sm text-violet-100';

function CopyButton({ value, children = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button className="text-sm text-violet-300" type="button" onClick={copy}>
      {copied ? 'Copied' : children}
    </button>
  );
}

function Explorer() {
  const [endpoint, setEndpoint] = useState('candidates');
  const [candidateId, setCandidateId] = useState('');
  const [limit, setLimit] = useState('10');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('newest');
  const [state, setState] = useState({ loading: false, status: '', body: '' });
  const path = useMemo(() => {
    if (endpoint === 'stats') return '/api/v1/stats';
    if (endpoint === 'candidate')
      return `/api/v1/candidates/${candidateId.trim() || 'CANDIDATE_UUID'}`;
    const params = new URLSearchParams({ limit, sort });
    if (type) params.set('type', type);
    return `/api/v1/candidates?${params}`;
  }, [endpoint, candidateId, limit, type, sort]);
  async function run() {
    if (path.includes('CANDIDATE_UUID')) {
      setState({ loading: false, status: 'Enter a candidate UUID.', body: '' });
      return;
    }
    setState({ loading: true, status: '', body: '' });
    try {
      const response = await fetch(path, { headers: { Accept: 'application/json' } });
      const text = await response.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
      setState({ loading: false, status: `${response.status} ${response.statusText}`, body });
    } catch (error) {
      setState({ loading: false, status: 'Request failed', body: error.message });
    }
  }
  return (
    <section className={`${panel} space-y-5`} aria-labelledby="try-api">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.16em] text-violet-300 uppercase">
            Interactive explorer
          </p>
          <h2 id="try-api" className="mt-2 text-2xl">
            Try the live API
          </h2>
        </div>
        <CopyButton value={`${window.location.origin}${path}`}>Copy request URL</CopyButton>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          Endpoint
          <select value={endpoint} onChange={event => setEndpoint(event.target.value)}>
            <option value="candidates">Candidate list</option>
            <option value="candidate">Candidate detail</option>
            <option value="stats">Statistics</option>
          </select>
        </label>
        {endpoint === 'candidate' && (
          <label className="sm:col-span-2">
            Candidate UUID
            <input value={candidateId} onChange={event => setCandidateId(event.target.value)} />
          </label>
        )}
        {endpoint === 'candidates' && (
          <>
            <label>
              Limit
              <input
                type="number"
                min="1"
                max="100"
                value={limit}
                onChange={event => setLimit(event.target.value)}
              />
            </label>
            <label>
              Type
              <select value={type} onChange={event => setType(event.target.value)}>
                <option value="">All</option>
                <option value="moving">Moving object</option>
                <option value="brightness">Brightness variation</option>
                <option value="transient">Appeared / disappeared</option>
                <option value="artifact">Possible artifact</option>
              </select>
            </label>
            <label>
              Sort
              <select value={sort} onChange={event => setSort(event.target.value)}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="most_reviewed">Most reviewed</option>
                <option value="highest_agreement">Highest agreement</option>
              </select>
            </label>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" disabled={state.loading} onClick={run}>
          {state.loading ? 'Requesting…' : 'Send request'}
        </button>
        <code className="text-sm text-[#aaa2bb]">{path}</code>
        {state.status && <span className="text-sm text-violet-200">{state.status}</span>}
      </div>
      {state.body && (
        <div>
          <div className="mb-2 flex justify-end">
            <CopyButton value={state.body}>Copy response</CopyButton>
          </div>
          <pre className={`${code} max-h-96`}>
            <code>{state.body}</code>
          </pre>
        </div>
      )}
    </section>
  );
}

function Endpoint({ method, path, children, parameters }) {
  return (
    <article className={`${panel} space-y-3`}>
      <p>
        <span className="mr-3 rounded bg-violet-300 px-2 py-1 text-xs font-bold text-[#100d18]">
          {method}
        </span>
        <code>{path}</code>
      </p>
      <p className="text-sm leading-relaxed text-[#aaa2bb]">{children}</p>
      {parameters && <p className="text-xs leading-relaxed text-[#8f8999]">{parameters}</p>}
    </article>
  );
}

export default function Developers() {
  const curl = `curl "${BASE_URL}/candidates?limit=10&min_reviews=2"`;
  const javascript = `const response = await fetch(
  "${BASE_URL}/candidates?limit=10"
);
if (!response.ok) throw new Error(\`API error: \${response.status}\`);
const result = await response.json();
console.log(result.data);`;
  const python = `import requests

response = requests.get(
    "${BASE_URL}/candidates",
    params={"limit": 10},
    timeout=15,
)
response.raise_for_status()
for candidate in response.json()["data"]:
    print(candidate)`;
  return (
    <>
      <Starfield />
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#0e0e11eb] px-5 py-5 sm:px-10">
        <a className="text-sm font-semibold tracking-[0.17em]" href="/">
          <span className="mr-3 text-2xl text-violet-300">✧</span>PARALLAX
        </a>
        <nav aria-label="Developer navigation" className="flex gap-5 text-sm text-[#b1a8bd]">
          <a href="/#explorer">Sky explorer</a>
          <a href="/community">Community</a>
          <a href="/developers" aria-current="page">
            API
          </a>
        </nav>
      </header>
      <main className="relative z-1 mx-auto max-w-6xl space-y-8 px-5 py-12 sm:px-10">
        <section className="max-w-4xl space-y-5">
          <p className="text-xs tracking-[0.16em] text-violet-300 uppercase">
            Parallax public API · v1
          </p>
          <h1 className="font-serif text-4xl sm:text-6xl">Citizen science, open to explore.</h1>
          <p className="text-base leading-relaxed text-[#aaa2bb]">
            Programmatic, read-only access to community-generated candidate reports, their original
            NASA/SPHEREx observation provenance, and independent review statistics.
          </p>
          <div className="rounded-xl border border-violet-300/30 bg-violet-300/5 p-5 text-sm leading-relaxed text-violet-100">
            Parallax candidate reports are community-generated and have not been independently
            scientifically validated. Community agreement does not constitute confirmation of an
            astronomical discovery. NASA does not endorse or validate Parallax reports.
          </div>
        </section>

        <section className={`${panel} grid gap-6 sm:grid-cols-2`}>
          <div>
            <p className="text-xs text-violet-300 uppercase">Base URL</p>
            <code className="mt-2 block break-all">{BASE_URL}</code>
          </div>
          <div>
            <p className="text-xs text-violet-300 uppercase">Authentication</p>
            <p className="mt-2 text-sm text-[#aaa2bb]">
              No API key or account is required for public reads.
            </p>
          </div>
        </section>

        <section className={`${panel} space-y-4`} aria-labelledby="embed-explorer">
          <p className="text-xs tracking-[0.16em] text-violet-300 uppercase">Shareable explorer</p>
          <h2 id="embed-explorer" className="text-2xl">
            Open or embed any sky position
          </h2>
          <p className="text-sm leading-relaxed text-[#aaa2bb]">
            Pass ICRS coordinates in decimal degrees with <code>ra</code>, <code>dec</code>, and an
            optional <code>fov</code>. Add <code>embed=1</code> for the compact iframe layout. The
            same validation limits apply as in the explorer: RA is 0–&lt;360°, Dec is −90–+90°, and
            FOV is 0.01–180°.
          </p>
          <pre className={code}>
            <code>{`https://parallax.dcephei.earth/?ra=83.633&dec=22.0145&fov=2#explorer

<iframe
  src="https://parallax.dcephei.earth/?ra=83.633&dec=22.0145&fov=2&embed=1"
  title="Parallax sky explorer"
  width="100%"
  height="900"
  loading="lazy"
></iframe>`}</code>
          </pre>
          <p className="text-xs leading-relaxed text-[#8f8999]">
            Embedded views load the same real archive tools and remain dependent on Parallax, Aladin
            Lite, and upstream NASA/IRSA service availability. The Parallax attribution and a link
            to the full explorer remain visible.
          </p>
        </section>

        <section className="space-y-4" aria-labelledby="endpoints">
          <h2 id="endpoints" className="text-3xl">
            Endpoints
          </h2>
          <Endpoint
            method="GET"
            path="/candidates"
            parameters="Parameters: limit (1–100, default 20), offset (≥0), type, status, min_agreement (0–100), min_reviews (≥0), and sort (newest, oldest, most_reviewed, highest_agreement)."
          >
            Lists public candidate reports with bounded pagination, report position, observation
            date range, and review statistics. The report position is the candidate’s representative
            submitted coordinate; per-observation marks remain available in candidate detail.
          </Endpoint>
          <Endpoint method="GET" path="/candidates/CANDIDATE_UUID">
            Returns one candidate and its saved observations in original order. Each observation
            includes its archive identifier, original IRSA FITS URL, wavelength bounds, marked
            coordinates, checksum, and saved view. Replace <code>CANDIDATE_UUID</code> with an ID
            returned by the list endpoint.
          </Endpoint>
          <Endpoint method="GET" path="/stats">
            Returns real candidate and review counts, including candidates awaiting review and
            counts by the four supported report types. These are activity statistics—not discovery
            or confirmation metrics.
          </Endpoint>
          <p className="text-sm leading-relaxed text-[#8f8999]">
            Celestial-radius filtering is not offered in v1 because the current schema has no
            reliable spherical-query interface. Unknown parameters return{' '}
            <code>400 INVALID_PARAMETER</code>. Missing records return 404, excessive requests
            return 429, and temporary data-service failures return 503 or 504. Public limits may
            change as Parallax grows.
          </p>
          <details className={panel}>
            <summary className="cursor-pointer text-violet-200">Example response shapes</summary>
            <p className="mt-3 text-sm text-[#9a9aa3]">
              Placeholders below describe the contract; they are not presented as live records.
            </p>
            <pre className={`${code} mt-4`}>
              <code>{`// GET /candidates
{
  "data": [{
    "id": "CANDIDATE_UUID",
    "type": "moving",
    "report_position": { "ra_degrees": 0, "dec_degrees": 0 },
    "observation_count": 2,
    "review_statistics": { "review_count": 0, "agreement_percent": null },
    "url": "https://parallax.dcephei.earth/community/CANDIDATE_UUID"
  }],
  "pagination": { "limit": 20, "offset": 0, "total": 1, "has_more": false },
  "meta": { "scientific_disclaimer": "…" }
}

// GET /candidates/CANDIDATE_UUID adds sky_region and ordered observations.
// GET /stats returns total_candidates, total_reviews,
// candidates_awaiting_review, candidates_with_reviews, and by_type.`}</code>
            </pre>
          </details>
        </section>

        <Explorer />

        <section className="space-y-4" aria-labelledby="examples">
          <h2 id="examples" className="text-3xl">
            Examples
          </h2>
          <div className="grid gap-5 lg:grid-cols-3">
            {[
              ['cURL', curl],
              ['JavaScript', javascript],
              ['Python', python],
            ].map(([label, value]) => (
              <article key={label} className={panel}>
                <div className="mb-3 flex justify-between">
                  <h3>{label}</h3>
                  <CopyButton value={value} />
                </div>
                <pre className={code}>
                  <code>{value}</code>
                </pre>
              </article>
            ))}
          </div>
        </section>

        <section className={`${panel} space-y-3 text-sm leading-relaxed text-[#aaa2bb]`}>
          <h2 className="text-2xl text-white">Scientific and reuse notes</h2>
          <p>
            Observation records identify original NASA/SPHEREx products served by Caltech/IPAC IRSA.
            Parallax stores community reports and classifications separately; the API does not
            return derived Overlay or Difference pixels and does not label candidates as
            discoveries.
          </p>
          <p>
            No community-submission data license has yet been established. The API provides access
            for inspection and research prototyping but does not make an unsupported relicensing
            claim. Follow the linked IRSA provenance for NASA archive terms and attribution.
          </p>
          <p>
            <a
              className="text-violet-300 underline"
              href="https://irsa.ipac.caltech.edu/Missions/spherex.html"
            >
              NASA/IPAC SPHEREx archive ↗
            </a>{' '}
            ·{' '}
            <a className="text-violet-300 underline" href="/community">
              Browse candidates ↗
            </a>
          </p>
        </section>
      </main>
      <footer className="relative z-1 mx-auto max-w-6xl border-t border-white/10 px-5 py-8 text-xs text-[#9a9aa3] sm:px-10">
        Parallax · Team Delta Cephei · Independent NASA Space Apps concept. No NASA affiliation or
        endorsement.
      </footer>
    </>
  );
}
