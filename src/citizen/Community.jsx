import { useEffect, useState } from 'react';
import Starfield from '../components/Starfield';
import Footer from '../components/Footer';
import ObservationWorkspace from './ObservationWorkspace';
import { CHANGE_TYPES } from './model';
import { citizenSession } from '../lib/supabase';
import {
  communityError,
  listCandidates,
  getCandidate,
  getOwnReview,
  saveReview,
  getStatistics,
} from './api';
const panel = 'rounded-xl border border-white/10 bg-[#141418] p-5 sm:p-6';
const verdictLabels = {
  agree: 'I see the reported change',
  disagree: 'I do not see the reported change',
  unsure: 'I am unsure',
};
function Statistics({ data }) {
  return (
    <p className="text-sm leading-relaxed text-[#b1a8bd]">
      {data.review_count} community reviews ·{' '}
      {data.agreement == null
        ? 'Awaiting review'
        : `${Number(data.agreement).toFixed(0)}% community agreement`}{' '}
      · {data.unsure_count} unsure
    </p>
  );
}
export default function Community({ candidateId }) {
  return (
    <>
      <Starfield />
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#0e0e11eb] px-5 py-5 sm:px-10">
        <a className="text-sm font-semibold tracking-[0.17em]" href="/">
          <span className="mr-3 text-2xl text-violet-300">✧</span>PARALLAX
        </a>
        <nav aria-label="Community navigation" className="flex gap-5 text-sm text-[#b1a8bd]">
          <a href="/#explorer">Sky explorer</a>
          <a href="/community" aria-current={!candidateId ? 'page' : undefined}>
            Community
          </a>
          <a href="/developers">API</a>
        </nav>
      </header>
      <main className="relative z-1 mx-auto max-w-7xl space-y-6 px-5 py-10 sm:px-10">
        <p className="text-xs tracking-[0.16em] text-violet-300 uppercase">
          Delta Cephei · Citizen science
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl">
          {candidateId ? 'A closer look.' : 'A sky of possibilities.'}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-[#9a9aa3]">
          Explore → Mark Object → Submit Candidate → Community Review. Candidates need further
          investigation. Community agreement is not scientific confirmation or the probability of
          Planet X.
        </p>
        {candidateId ? <Investigation key={candidateId} id={candidateId} /> : <CandidateList />}
      </main>
      <Footer />
    </>
  );
}
function CandidateList() {
  const [type, setType] = useState(''),
    [sort, setSort] = useState('newest'),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, rows: [], count: 0, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, rows: [], count: 0, error: '' });
    listCandidates({ type, sort, page, signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) setState({ ...result, loading: false, error: '' });
      })
      .catch(e => {
        if (!controller.signal.aborted)
          setState({ loading: false, rows: [], count: 0, error: communityError(e) });
      });
    return () => controller.abort();
  }, [type, sort, page, revision]);
  return (
    <>
      <div className={`${panel} flex flex-wrap items-end gap-4`}>
        <label className="min-w-48 flex-1">
          Candidate type
          <select
            value={type}
            onChange={e => {
              setType(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All types</option>
            {Object.entries(CHANGE_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-40">
          Sort by
          <select
            value={sort}
            onChange={e => {
              setSort(e.target.value);
              setPage(0);
            }}
          >
            <option value="newest">Newest</option>
            <option value="reviewed">Most reviewed</option>
          </select>
        </label>
        <button onClick={() => setRevision(n => n + 1)}>Refresh</button>
      </div>
      {state.loading && <p role="status">Loading community candidates…</p>}
      {state.error && (
        <div role="alert" className={`${panel} text-rose-300`}>
          {state.error}
          <button className="ml-3" onClick={() => setRevision(n => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {!state.loading && !state.error && !state.rows.length && (
        <div className={panel}>
          <h2 className="text-xl">No candidates here yet.</h2>
          <p className="mt-3 text-sm text-[#9a9aa3]">
            Mark an original SPHEREx exposure in the sky explorer, or try another filter.
          </p>
          <a className="mt-4 inline-block text-violet-300 underline" href="/#explorer">
            Explore the sky ↗
          </a>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {state.rows.map(candidate => (
          <article key={candidate.id} className={`${panel} space-y-3`}>
            <p className="text-xs text-violet-300">Candidate · Needs further investigation</p>
            <h2 className="text-xl">{CHANGE_TYPES[candidate.type]}</h2>
            <p className="text-xs text-[#9a9aa3]">
              RA {candidate.ra.toFixed(6)}° · Dec {candidate.dec.toFixed(6)}° ·{' '}
              {new Date(candidate.created_at).toLocaleDateString()}
            </p>
            <p className="text-sm leading-relaxed break-words">
              {candidate.description || 'No description provided.'}
            </p>
            <Statistics data={candidate} />
            <a
              className="inline-block rounded-lg border border-violet-300/40 px-4 py-2 text-sm text-violet-200"
              href={`/community/${candidate.id}`}
            >
              Investigate ↗
            </a>
          </article>
        ))}
      </div>
      {state.count > 20 && (
        <div className="flex items-center gap-3">
          <button disabled={!page || state.loading} onClick={() => setPage(p => p - 1)}>
            Previous page
          </button>
          <span className="text-sm">
            Page {page + 1} of {Math.ceil(state.count / 20)}
          </span>
          <button
            disabled={(page + 1) * 20 >= state.count || state.loading}
            onClick={() => setPage(p => p + 1)}
          >
            Next page
          </button>
        </div>
      )}
    </>
  );
}
function Investigation({ id }) {
  const [candidate, setCandidate] = useState(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const [user, setUser] = useState(null),
    [authError, setAuthError] = useState(''),
    [review, setReview] = useState(null),
    [verdict, setVerdict] = useState('');
  const [busy, setBusy] = useState(false),
    [inspected, setInspected] = useState(false),
    [reveal, setReveal] = useState(false),
    [stats, setStats] = useState(null);
  const own = !!candidate && candidate.user_id === user?.id;
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setCandidate(null);
    if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id)) {
      setError('Invalid candidate link.');
      return;
    }
    getCandidate(id, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setCandidate(data);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(communityError(e));
      });
    return () => controller.abort();
  }, [id, revision]);
  useEffect(() => {
    let cancelled = false;
    citizenSession()
      .then(async current => {
        const existing = await getOwnReview(id, current);
        if (!cancelled) {
          setUser(current);
          setReview(existing);
          setAuthError('');
        }
      })
      .catch(e => {
        if (!cancelled) setAuthError(communityError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id, revision]);
  useEffect(() => {
    if (!review && !own) return;
    let cancelled = false;
    getStatistics(id)
      .then(data => {
        if (!cancelled) setStats(data);
      })
      .catch(e => {
        if (!cancelled) setError(communityError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [review, own, id]);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const result = await saveReview(candidate, verdict);
      setReview(result);
    } catch (e) {
      setError(communityError(e));
      if (e.code === '23505' && user) setReview(await getOwnReview(id, user));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="text-sm text-violet-300 underline" href="/community">
        ← All candidates
      </a>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error} <button onClick={() => setRevision(n => n + 1)}>Retry</button>
        </p>
      )}
      {!candidate && !error && <p role="status">Loading the saved observation sequence…</p>}
      {candidate && (
        <>
          <div className={`${panel} space-y-3`}>
            <h2 className="text-xl">
              {review || own ? CHANGE_TYPES[candidate.type] : 'Independent investigation'}
            </h2>
            <p className="text-sm text-[#9a9aa3]">
              {candidate.observations.length} original exposures · RA{' '}
              {candidate.center_ra.toFixed(6)}° · Dec {candidate.center_dec.toFixed(6)}° ·{' '}
              {candidate.fov.toFixed(3)}° FOV
            </p>
            {review || own ? (
              <>
                <p className="text-sm break-words">
                  {candidate.description || 'No description provided.'}
                </p>
                <p className="text-xs text-[#9a9aa3]">
                  Reporter confidence: {candidate.confidence}. Candidate status: Needs further
                  investigation.
                </p>
                {stats && <Statistics data={stats} />}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reveal}
                    onChange={e => setReveal(e.target.checked)}
                    className="!mt-0 !w-auto"
                  />
                  Reveal reporter’s markers
                </label>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-[#9a9aa3]">
                Reporter details, markers, and community results stay hidden here until you submit
                your assessment. Inspect every frame; compare the band and observation dates.
              </p>
            )}
          </div>
          <ObservationWorkspace
            position={{ ra: candidate.center_ra, dec: candidate.center_dec, fov: candidate.fov }}
            initialFrames={candidate.observations}
            investigation
            revealReporter={reveal}
            onInspected={setInspected}
          />
          <section className={`${panel} space-y-4`} aria-label="Community assessment">
            <h2 className="text-xl">Your assessment</h2>
            {authError && (
              <p role="alert" className="text-sm text-rose-300">
                {authError} <button onClick={() => setRevision(n => n + 1)}>Retry session</button>
              </p>
            )}
            {own ? (
              <p>You submitted this candidate and cannot review it.</p>
            ) : review ? (
              <p role="status">
                Saved: {verdictLabels[review.verdict]}. Thank you for investigating.
              </p>
            ) : (
              <>
                <fieldset disabled={!user || busy}>
                  <legend className="mb-3 text-sm">Does the sequence show a change?</legend>
                  <div className="space-y-3">
                    {Object.entries(verdictLabels).map(([v, label]) => (
                      <label key={v} className="flex items-center gap-3 text-sm">
                        <input
                          className="!mt-0 !w-auto"
                          type="radio"
                          name="verdict"
                          value={v}
                          checked={verdict === v}
                          onChange={() => setVerdict(v)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className="text-xs text-[#9a9aa3]">
                  {!inspected
                    ? 'Load each original frame before submitting. Missing or changed images block review.'
                    : 'All original frames loaded. Choose an assessment when ready.'}
                </p>
                <button disabled={!user || !verdict || !inspected || busy} onClick={submit}>
                  {busy ? 'Saving…' : 'Submit assessment'}
                </button>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
