import { useEffect, useMemo, useState } from 'react';
import { BANDS } from './api/observations';
import ComparisonPanel from './components/ComparisonPanel';
import PositionForm from './components/PositionForm';
import SkyViewer from './components/SkyViewer';
import Timeline from './components/Timeline';
import { useObservations } from './hooks/useObservations';
import Starfield from './components/Starfield';
import Landing, { Mission } from './components/Landing';
import Tutorial from './components/Tutorial';

export default function App() {
  const [tourOpen, setTourOpen] = useState(false);
  const [position, setPosition] = useState({ ra: 83.633, dec: 22.0145, fov: 2 });
  const [band, setBand] = useState(BANDS[0].id);
  const [revision, refresh] = useState(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(800);
  const query = useMemo(() => ({ ...position, band }), [position, band]);
  const { rows, loading, error } = useObservations(query, revision);

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [query, revision]);

  useEffect(() => {
    if (!playing || rows.length < 2) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % rows.length), speed);
    return () => clearInterval(timer);
  }, [playing, speed, rows]);

  const current = rows[index];
  const mock = (import.meta.env.VITE_OBSERVATION_MODE || 'mock') === 'mock';

  return (
    <>
      <Starfield />
      <a
        className="skip-link fixed -top-25 left-5 z-150 rounded-md bg-(--accent) p-3.5 text-[#0e0e11] focus:top-3"
        href="#explorer"
      >
        Skip to sky explorer
      </a>
      <nav
        className="site-nav wide:pr-[max(40px,calc((100%-1360px)/2))] wide:pl-[max(40px,calc((100%-1360px)/2))] tablet:h-16.5 tablet:px-6 tablet:py-0 mobile:gap-2.5 mobile:px-4.5 mobile:py-0 fixed top-0 right-0 left-0 z-30 flex h-18.5 items-center justify-between gap-6 bg-[#0e0e11eb] px-10 py-0 [backdrop-filter:blur(14px)] [border-bottom:1px_solid_var(--line)]"
        aria-label="Main navigation"
      >
        <a
          href="#top"
          className="site-brand mobile:gap-1.75 mobile:text-[0.73rem] inline-flex items-center gap-3 text-[0.85rem] font-semibold tracking-[0.17em] whitespace-nowrap [&_>_span]:text-[24px] [&_>_span]:leading-none [&_>_span]:text-(--accent)"
        >
          <span aria-hidden="true">✧</span> PARALLAX
        </a>
        <div className="nav-links laptop:gap-5 tablet:hidden flex gap-8 text-[0.78rem] text-[#adadb6] [&_a:hover]:text-(--accent)">
          <a href="#method">Method</a>
          <a href="#explorer">Sky explorer</a>
          <a href="#perspective">Parallax</a>
          <a href="#mission">Mission</a>
        </div>
        <div className="nav-actions mobile:gap-3.75 flex items-center gap-5.5">
          <button
            className="tour-trigger flex items-center gap-2 px-0 py-1 text-[0.75rem] text-[#b7b7c0] [background:none] [border:0] [&_>_span:first-child]:inline-grid [&_>_span:first-child]:h-5.5 [&_>_span:first-child]:w-5.5 [&_>_span:first-child]:place-items-center [&_>_span:first-child]:rounded-[50%] [&_>_span:first-child]:[border:1px_solid_#57535f] [&:hover]:text-(--accent) [&:hover]:[background:none]"
            aria-label="Open tutorial"
            onClick={() => setTourOpen(true)}
          >
            <span aria-hidden="true">?</span>{' '}
            <span className="tutorial-label mobile:hidden">Tutorial</span>
          </button>
          <a
            href="#explorer"
            className="nav-explore mobile:gap-3.5 mobile:px-3 mobile:py-2.25 flex gap-4.5 rounded-md bg-(--accent) px-4.25 py-2.5 text-[0.75rem] font-semibold text-[#100d18] [&:hover]:bg-[#bca6fb]"
          >
            Explore <span aria-hidden="true">↗</span>
          </a>
        </div>
      </nav>

      <main className="site-content tablet:px-6 tablet:py-0 mobile:px-4.5 mobile:py-0 relative z-1 m-auto max-w-360 px-10 py-0">
        <Landing onTour={() => setTourOpen(true)} />
        <section
          id="explorer"
          className="explorer-section scroll-mt-7 px-0 pt-22.5 pb-17.5 [border-top:1px_solid_var(--line)]"
          aria-labelledby="explorer-title"
        >
          <div className="explorer-heading mobile:flex-col mobile:[align-items:start] mobile:gap-5 mobile:[&_>_.action-outline]:min-h-10.5 mobile:[&_>_.action-outline]:px-4 mobile:[&_>_.action-outline]:py-2.75 flex [align-items:end] justify-between gap-6 [&_.display-heading]:mt-4.5 [&_.display-heading]:text-[clamp(2.5rem,4vw,3.7rem)]">
            <div>
              <p className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
                03 / Sky explorer
              </p>
              <h2
                id="explorer-title"
                className="display-heading mobile:text-[2.65rem] mt-5.5 font-[Georgia,'Times_New_Roman',serif] text-[clamp(2.6rem,4.6vw,4.2rem)] leading-[1.1] font-normal tracking-[-0.035em] [&_em]:font-normal [&_em]:text-[#b5a0e5]"
              >
                Your window into <em>the sky.</em>
              </h2>
            </div>
            <button
              className="action-outline inline-flex min-h-12 items-center justify-center gap-6.25 rounded-[7px] bg-[#0e0e1144] px-5.5 py-3.75 text-[0.8rem] leading-[1.3] font-medium text-[#ececef] [border:1px_solid_#ffffff30] [transition:background_0.2s,border-color_0.2s] [&:hover]:border-[#a78bfa88] [&:hover]:bg-[#a78bfa09] [&:hover]:text-[#c4b5fd]"
              onClick={() => setTourOpen(true)}
            >
              Guide me <span aria-hidden="true">↗</span>
            </button>
          </div>
          <p className="explorer-description mx-0 mt-5 mb-7.5 text-[0.85rem] leading-[1.8] text-[#9a9aa3]">
            Choose a field. Explore an image. Get to know your corner of the universe.
          </p>
          <div className="notice mobile:gap-2.25 mobile:p-3 mobile:text-[0.67rem] mb-6 flex items-baseline gap-3 rounded-[9px] bg-[#17141e] px-4.5 py-3.5 text-[0.73rem] leading-[1.8] text-[#aaa2bb] [border:1px_solid_#a78bfa28] [&_strong]:font-medium [&_strong]:text-[#c6b4e9]">
            <span className="status-dot inline-block h-1.25 w-1.25 shrink-0 rounded-[50%] bg-(--accent)" />
            <p>
              <strong>{mock ? 'Demo observations' : 'Custom observation adapter'}</strong> · The
              timeline and demo band groups are synthetic. The SPHEREx DR1 mosaic and IRSA exposure
              search below use real mission data and operate independently of this demo timeline.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[350px_1fr]">
            <aside className="space-y-5">
              <div data-tour="coordinates">
                <PositionForm onApply={setPosition} />
              </div>
              <section
                className="panel mobile:p-4.5 space-y-4 rounded-xl bg-[#141418] p-5.5 [border:1px_solid_var(--line)] [&_h2]:mt-2 [&_h2]:font-[inherit] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em]"
                data-tour="bands"
              >
                <div className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
                  02 / Spectrum
                </div>
                <h2>Select a demo band</h2>
                <label>
                  Band group
                  <select value={band} onChange={e => setBand(e.target.value)}>
                    {BANDS.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted text-[0.75rem] leading-[1.75] text-[#9a9aa3]">
                  Illustrative groups, not the mission’s 102 channel definitions. Filters metadata
                  only.
                </p>
                <button onClick={() => refresh(r => r + 1)} disabled={loading}>
                  Refresh observations
                </button>
              </section>
              <div data-tour="compare">
                <ComparisonPanel />
              </div>
            </aside>
            <div className="space-y-5">
              <div>
                <SkyViewer position={position} />
              </div>
              <div data-tour="timeline">
                <Timeline
                  rows={rows}
                  index={Math.min(index, Math.max(0, rows.length - 1))}
                  setIndex={setIndex}
                  playing={playing}
                  setPlaying={setPlaying}
                  speed={speed}
                  setSpeed={setSpeed}
                />
              </div>
              <section
                className="panel mobile:p-4.5 rounded-xl bg-[#141418] p-5.5 [border:1px_solid_var(--line)] [&_h2]:mt-2 [&_h2]:font-[inherit] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em]"
                aria-label="Data provenance"
              >
                {loading ? (
                  <p role="status">Loading observations…</p>
                ) : error ? (
                  <p role="alert" className="error text-[0.85rem] text-[#fda4af]">
                    {error}
                  </p>
                ) : current ? (
                  <>
                    <div className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
                      {current.isMock
                        ? 'Synthetic observation'
                        : 'Adapter-supplied metadata · not independently verified'}
                    </div>
                    <p className="mt-2 wrap-break-word">{current.provenance}</p>
                    <p className="muted mt-2 text-[0.75rem] leading-[1.75] text-[#9a9aa3]">
                      ID: {current.id} · RA {position.ra}° / Dec {position.dec}° · {position.fov}°
                      FOV
                    </p>
                  </>
                ) : (
                  <p>No observations found. Try another location or refresh.</p>
                )}
              </section>
            </div>
          </div>
        </section>
        <Mission />
      </main>

      <footer className="site-footer laptop:mx-10 laptop:my-0 tablet:mx-6 tablet:my-0 tablet:flex-wrap tablet:[align-items:start] mobile:mx-4.5 mobile:my-0 mobile:flex-col mobile:gap-5 mobile:px-0 mobile:py-8.75 tablet:[&_>_.text-link]:mt-2.5 relative z-1 mx-auto my-0 flex max-w-340 items-center justify-between gap-7.5 px-0 pt-10.5 pb-12 [border-top:1px_solid_var(--line)] [&_>_.text-link]:m-0 [&_>_.text-link]:whitespace-nowrap [&_p]:mt-3 [&_p]:text-[0.65rem] [&_p]:leading-[1.9] [&_p]:text-[#827c8c]">
        <div>
          <a
            href="#top"
            className="site-brand mobile:gap-1.75 mobile:text-[0.73rem] inline-flex items-center gap-3 text-[0.85rem] font-semibold tracking-[0.17em] whitespace-nowrap [&_>_span]:text-[24px] [&_>_span]:leading-none [&_>_span]:text-(--accent)"
          >
            <span aria-hidden="true">✧</span> PARALLAX
          </a>
          <p>A new perspective on the night sky.</p>
        </div>
        <p>
          Independent NASA Space Apps concept.
          <br />
          Imagery: NASA/SPHEREx · Caltech/IPAC · Astropy / DSS / 2MASS · Viewer: CDS Aladin Lite.
        </p>
        <a
          href="#top"
          className="text-link mt-7 inline-flex items-center gap-6 text-[0.75rem] text-[#c1b1e5] [&:hover]:text-(--accent)"
        >
          Back to the stars ↑
        </a>
      </footer>

      {tourOpen && <Tutorial onClose={() => setTourOpen(false)} />}
    </>
  );
}
