import { useEffect, useState } from 'react';
import ObservationWorkspace from './citizen/ObservationWorkspace';
import Landing, { Mission } from './components/Landing';
import PositionForm from './components/PositionForm';
import Starfield from './components/Starfield';
import Tutorial from './components/Tutorial';
import SoundToggle from './components/SoundToggle';
import Footer from './components/Footer';
import { explorerUrl, parseExplorerUrl } from './lib/explorerUrl';

export default function App() {
  const [initial] = useState(() => parseExplorerUrl(window.location.search));
  const [tourOpen, setTourOpen] = useState(false);
  const [position, setPosition] = useState(initial.position);
  const [urlError, setUrlError] = useState(initial.error);
  const [skyControlsHost, setSkyControlsHost] = useState(null);
  const [comparisonHost, setComparisonHost] = useState(null);
  const embed = initial.embed;
  useEffect(() => {
    function restoreFromUrl() {
      const next = parseExplorerUrl(window.location.search);
      setPosition(next.position);
      setUrlError(next.error);
    }
    window.addEventListener('popstate', restoreFromUrl);
    return () => window.removeEventListener('popstate', restoreFromUrl);
  }, []);
  useEffect(() => {
    if (!initial.hasCoordinates || embed) return;
    requestAnimationFrame(() => document.getElementById('explorer')?.scrollIntoView());
  }, [embed, initial.hasCoordinates]);
  function applyPosition(next) {
    setPosition(next);
    setUrlError('');
    const url = new URL(explorerUrl(next, { embed, origin: window.location.origin }));
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return (
    <>
      <Starfield />
      <SoundToggle />
      {!embed && (
        <a
          className="skip-link fixed -top-25 left-5 z-150 rounded-md bg-(--accent) p-3.5 text-[#0e0e11] focus:top-3"
          href="#explorer"
        >
          Skip to sky explorer
        </a>
      )}
      {!embed && (
        <nav
          className="site-nav wide:pr-[max(40px,calc((100%-1360px)/2))] wide:pl-[max(40px,calc((100%-1360px)/2))] tablet:h-16.5 tablet:px-6 tablet:py-0 mobile:gap-2.5 mobile:px-4.5 mobile:py-0 fixed top-0 right-0 left-0 z-30 flex h-18.5 items-center justify-between gap-6 bg-[#0e0e11eb] px-10 py-0 [backdrop-filter:blur(14px)] [border-bottom:1px_solid_var(--line)]"
          aria-label="Main navigation"
        >
          <a
            href="#top"
            className="site-brand mobile:gap-1.75 mobile:text-[0.73rem] inline-flex items-center gap-3 text-[0.85rem] font-semibold tracking-[0.17em] whitespace-nowrap [&_>_span]:text-[24px] [&_>_span]:leading-none [&_>_span]:text-(--accent)"
          >
            <img className="size-10" src="delta-cephei-logo.svg" alt="" />
            PARALLAX
          </a>
          <div className="nav-links laptop:gap-5 tablet:hidden flex gap-8 text-[0.78rem] text-[#adadb6] [&_a:hover]:text-(--accent)">
            <a href="#method">Method</a>
            <a href="#explorer">Sky explorer</a>
            <a href="#perspective">Parallax</a>
            <a href="#mission">Mission</a>
            <a href="/community">Community</a>
            <a href="/developers">API</a>
          </div>
          <div className="nav-actions mobile:gap-3.75 flex items-center gap-5.5">
            <a className="tablet:inline hidden text-xs text-violet-200" href="/community">
              Community
            </a>
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
      )}
      {embed && (
        <header className="relative z-20 flex items-center justify-between border-b border-white/10 bg-[#0e0e11eb] px-4 py-3">
          <a className="text-xs font-semibold tracking-[0.17em]" href="/" target="_blank">
            <span className="mr-2 text-lg text-violet-300">✧</span>PARALLAX
          </a>
          <a
            className="text-xs text-violet-300 underline"
            href={explorerUrl(position, { origin: window.location.origin })}
            target="_blank"
            rel="noreferrer"
          >
            Open full explorer ↗
          </a>
        </header>
      )}

      <main
        className={
          embed
            ? 'site-content relative z-1 mx-auto max-w-360 px-3'
            : 'site-content tablet:px-6 tablet:py-0 mobile:px-4.5 mobile:py-0 relative z-1 m-auto max-w-360 px-10 py-0'
        }
      >
        {!embed && <Landing onTour={() => setTourOpen(true)} />}
        <section
          id="explorer"
          className={
            embed
              ? 'explorer-section px-0 py-4'
              : 'explorer-section scroll-mt-7 px-0 pt-22.5 pb-17.5 [border-top:1px_solid_var(--line)]'
          }
          aria-label={embed ? 'Parallax sky explorer' : undefined}
          aria-labelledby={embed ? undefined : 'explorer-title'}
        >
          {!embed && (
            <>
              <div className="explorer-heading mobile:flex-col mobile:[align-items:start] mobile:gap-5 mobile:[&_>_.action-outline]:min-h-10.5 mobile:[&_>_.action-outline]:px-4 mobile:[&_>_.action-outline]:py-2.75 flex [align-items:end] justify-between gap-6 [&_.display-heading]:mt-4.5 [&_.display-heading]:text-[clamp(2.5rem,4vw,3.7rem)]">
                <div>
                  <p className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
                    Sky explorer
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
                  <strong>SPHEREx observations</strong> · Explore the infrared sky map, then open
                  individual images from NASA’s archive to build your observation timeline.
                </p>
              </div>
            </>
          )}
          {urlError && (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-rose-300/30 bg-rose-300/5 p-4 text-sm text-rose-300"
            >
              {urlError}
            </p>
          )}
          <div className="grid gap-5 lg:grid-cols-[350px_1fr]">
            <aside className="space-y-5">
              <div data-tour="coordinates">
                <PositionForm position={position} onApply={applyPosition} />
              </div>
              <div ref={setSkyControlsHost} />
              <div ref={setComparisonHost} />
            </aside>
            <div className="space-y-5">
              <div>
                <ObservationWorkspace
                  position={position}
                  skyControlsHost={skyControlsHost}
                  skyControlsInSidebar
                  comparisonHost={comparisonHost}
                  comparisonInSidebar
                />
              </div>
            </div>
          </div>
        </section>
        {!embed && <Mission />}
      </main>

      {!embed && <Footer />}

      {tourOpen && <Tutorial onClose={() => setTourOpen(false)} />}
    </>
  );
}
