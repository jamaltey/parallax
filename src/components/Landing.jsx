export default function Landing({ onTour }) {
  return (
    <>
      <header
        className="landing-hero tablet:h-[90svh] tablet:min-h-185 mobile:h-[95svh] mobile:min-h-182.5 mobile:pt-30 mobile:pb-28.75 laptop:[&_h1]:text-[6.4rem] tablet:[&_h1]:text-[clamp(4.5rem,12vw,6.5rem)] mobile:[&_h1]:text-[4.5rem] mobile:[&_h1]:tracking-[-0.055em] relative isolate flex h-[min(940px,100svh)] min-h-202.5 items-center overflow-clip px-0 pt-32.5 pb-27.5 [&_h1]:m-0 [&_h1]:font-[Georgia,'Times_New_Roman',serif] [&_h1]:text-[clamp(4.6rem,7.6vw,7.4rem)] [&_h1]:leading-[0.98] [&_h1]:font-normal [&_h1]:tracking-[-0.055em] [&_h1_em]:font-normal [&_h1_em]:text-[#b5a0e5]"
        id="top"
      >
        <div className="hero-copy laptop:max-w-150 tablet:max-w-155 relative z-2 max-w-172.5">
          <p className="eyebrow hero-kicker mobile:mb-7.5 mobile:gap-2 mobile:text-[0.51rem] mobile:tracking-[0.12em] mb-8.5 flex items-center gap-3 text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
            <span className="status-dot inline-block h-1.25 w-1.25 shrink-0 rounded-[50%] bg-(--accent)" />{' '}
            A different perspective on the universe
          </p>
          <h1>
            The sky never
            <br />
            stands <em>still.</em>
          </h1>
          <p className="hero-description tablet:max-w-122.5 mobile:mt-7 mobile:text-[0.87rem] mobile:leading-[1.9] mt-7.5 max-w-132.5 text-[1rem] leading-[1.9] text-[#aaaab5]">
            A point of light. A small shift. A whole new possibility.
            <br className="desktop-break mobile:hidden" /> Explore the sky with Parallax, one
            observation at a time.
          </p>
          <div className="hero-actions mobile:gap-2.5 mobile:[&_>_.action-outline]:gap-3.75 mobile:[&_>_.action-outline]:px-4 mobile:[&_>_.action-outline]:py-3.5 mobile:[&_>_.action-outline]:text-[0.73rem] mobile:[&_>_.action-primary]:gap-3.75 mobile:[&_>_.action-primary]:px-4 mobile:[&_>_.action-primary]:py-3.5 mobile:[&_>_.action-primary]:text-[0.73rem] mt-8 flex flex-wrap gap-3.5">
            <a
              href="#explorer"
              className="action-primary inline-flex min-h-12 items-center justify-center gap-6.25 rounded-[7px] bg-(--accent) px-5.5 py-3.75 text-[0.8rem] leading-[1.3] font-medium text-[#110d1b] [border:1px_solid_var(--accent)] [transition:background_0.2s,border-color_0.2s] [&:hover]:border-[#bda6fb] [&:hover]:bg-[#bda6fb] [&:hover]:text-[#110d1b]"
            >
              Open sky explorer <span aria-hidden="true">↗</span>
            </a>
            <button
              className="action-outline inline-flex min-h-12 items-center justify-center gap-6.25 rounded-[7px] bg-[#0e0e1144] px-5.5 py-3.75 text-[0.8rem] leading-[1.3] font-medium text-[#ececef] [border:1px_solid_#ffffff30] [transition:background_0.2s,border-color_0.2s] [&:hover]:border-[#a78bfa88] [&:hover]:bg-[#a78bfa09] [&:hover]:text-[#c4b5fd]"
              onClick={onTour}
            >
              Take a quick tour <span aria-hidden="true">→</span>
            </button>
          </div>
          <p className="hero-note mobile:max-w-67.5 mobile:text-[0.59rem] mt-6.5 text-[0.65rem] leading-[1.7] text-[#777781]">
            A NASA Space Apps challenge concept · SPHEREx data from IRSA
          </p>
        </div>
        <div
          className="orbit-art laptop:-right-25 laptop:w-130 laptop:opacity-[0.6] tablet:top-[45%] tablet:-right-30 tablet:w-112.5 tablet:opacity-[0.3] mobile:top-[48%] mobile:-right-20 mobile:w-95 mobile:opacity-[0.22] absolute top-[50%] -right-11.25 z-0 w-155 transform-[translateY(-47%)] text-[#76717f] opacity-[0.9] [&_svg]:h-auto [&_svg]:w-full"
          role="img"
          aria-label="Illustration of an orbit around a star; not observational data"
        >
          <svg viewBox="0 0 620 620" aria-hidden="true">
            <defs>
              <radialGradient id="sun-glow">
                <stop stopColor="#e9ddff" stopOpacity=".2" />
                <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="310" cy="310" r="185" fill="url(#sun-glow)" />
            <g fill="none" stroke="currentColor" strokeWidth=".8">
              <circle cx="310" cy="310" r="44" />
              <circle cx="310" cy="310" r="83" />
              <circle cx="310" cy="310" r="145" />
              <circle cx="310" cy="310" r="210" opacity=".4" />
            </g>
            <circle cx="310" cy="310" r="5" fill="#ececef" />
            <circle cx="310" cy="227" r="3" fill="#9a9aa3" />
            <circle cx="173" cy="357" r="4" fill="#9a9aa3" />
            <ellipse
              cx="313"
              cy="312"
              rx="260"
              ry="210"
              transform="rotate(-34 313 312)"
              fill="none"
              stroke="#a78bfa"
              strokeWidth="1.1"
              strokeDasharray="5 7"
              opacity=".8"
            />
            <g className="orbit-traveler origin-[310px_310px] animate-[orbit-drift_80s_linear_infinite]">
              <circle cx="528" cy="158" r="14" fill="#a78bfa" opacity=".08" />
              <circle cx="528" cy="158" r="5" fill="#bca6fb" />
            </g>
            <text x="350" y="505" fill="#a78bfa" fontSize="10" letterSpacing="2">
              A CHANGE IN PERSPECTIVE
            </text>
            <path d="M310 297v-12m0 38v12m-13-25h-12m38 0h12" stroke="#9a9aa3" strokeWidth=".6" />
          </svg>
          <span className="orbit-caption absolute right-38.75 bottom-11.25 text-[0.49rem] tracking-[0.18em] text-[#696671]">
            ORBITAL SKETCH / ILLUSTRATIVE
          </span>
        </div>
        <a
          className="scroll-cue mobile:bottom-8 absolute bottom-10.5 left-0 flex items-center gap-3 text-[0.55rem] tracking-[0.18em] text-[#8e8b98] uppercase [&_>_span]:h-7.75 [&_>_span]:w-px [&_>_span]:[background:linear-gradient(var(--accent),transparent)]"
          href="#method"
        >
          <span /> Scroll to discover
        </a>
      </header>
      <section
        className="landing-section tablet:px-0 tablet:py-18.75 scroll-mt-7.5 px-0 py-27.5"
        id="method"
        aria-labelledby="method-title"
      >
        <div className="section-intro mobile:[&_>_p:last-child]:text-[0.85rem] max-w-185 [&_>_p:last-child]:mt-6.5 [&_>_p:last-child]:max-w-132.5 [&_>_p:last-child]:text-[0.95rem] [&_>_p:last-child]:leading-[1.9] [&_>_p:last-child]:text-[#9a9aa3]">
          <p className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
            01 / The method
          </p>
          <h2
            id="method-title"
            className="display-heading mobile:text-[2.65rem] mt-5.5 font-[Georgia,'Times_New_Roman',serif] text-[clamp(2.6rem,4.6vw,4.2rem)] leading-[1.1] font-normal tracking-[-0.035em] [&_em]:font-normal [&_em]:text-[#b5a0e5]"
          >
            Small changes.
            <br />
            <em>Extraordinary possibilities.</em>
          </h2>
          <p>
            Discover how comparing observations can reveal a sky in motion. Start with the tools
            available in this prototype.
          </p>
        </div>
        <div className="method-list mt-16.25">
          <article className="method-row laptop:grid-cols-[40px_1fr_0.8fr] laptop:gap-5.5 tablet:grid-cols-[35px_1fr] tablet:gap-4.5 mobile:px-0 mobile:py-7.5 mobile:[&_h3]:text-[1.8rem] tablet:[&_p]:max-w-none mobile:[&_p]:text-[0.8rem] laptop:[&_ul]:pl-3.75 tablet:[&_ul]:col-2 tablet:[&_ul]:p-0 grid grid-cols-[60px_1fr_0.75fr] gap-9 px-0 py-10 [border-top:1px_solid_var(--line)] [&_h3]:font-[Georgia,serif] [&_h3]:text-[2rem] [&_h3]:font-normal [&_h3]:tracking-[-0.02em] [&_li]:px-0 [&_li]:py-3.75 [&_li]:[border-bottom:1px_solid_var(--line)] [&_li:before]:mr-3.5 [&_li:before]:text-[0.75rem] [&_li:before]:text-[#8a739f] [&_li:before]:[content:'↗'] [&_p]:mt-3.5 [&_p]:max-w-120 [&_p]:text-[0.85rem] [&_p]:leading-[1.9] [&_p]:text-[#9a9aa3] [&_ul]:m-0 [&_ul]:list-none [&_ul]:p-[0_0_0_40px] [&_ul]:text-[0.75rem] [&_ul]:text-[#a9a7b2]">
            <span className="method-number pt-2.5 text-[0.7rem] text-[#9d89c6] tabular-nums">
              01
            </span>
            <div>
              <h3>See the sky.</h3>
              <p>
                Choose a patch of sky, load a public FITS image, and explore its detail. The image’s
                coordinates place it on the celestial sphere.
              </p>
            </div>
            <ul>
              <li>Interactive Aladin Lite atlas</li>
              <li>Local optical and infrared samples</li>
              <li>RA, Dec, and field-of-view controls</li>
            </ul>
          </article>
          <article className="method-row laptop:grid-cols-[40px_1fr_0.8fr] laptop:gap-5.5 tablet:grid-cols-[35px_1fr] tablet:gap-4.5 mobile:px-0 mobile:py-7.5 mobile:[&_h3]:text-[1.8rem] tablet:[&_p]:max-w-none mobile:[&_p]:text-[0.8rem] laptop:[&_ul]:pl-3.75 tablet:[&_ul]:col-2 tablet:[&_ul]:p-0 grid grid-cols-[60px_1fr_0.75fr] gap-9 px-0 py-10 [border-top:1px_solid_var(--line)] [&_h3]:font-[Georgia,serif] [&_h3]:text-[2rem] [&_h3]:font-normal [&_h3]:tracking-[-0.02em] [&_li]:px-0 [&_li]:py-3.75 [&_li]:[border-bottom:1px_solid_var(--line)] [&_li:before]:mr-3.5 [&_li:before]:text-[0.75rem] [&_li:before]:text-[#8a739f] [&_li:before]:[content:'↗'] [&_p]:mt-3.5 [&_p]:max-w-120 [&_p]:text-[0.85rem] [&_p]:leading-[1.9] [&_p]:text-[#9a9aa3] [&_ul]:m-0 [&_ul]:list-none [&_ul]:p-[0_0_0_40px] [&_ul]:text-[0.75rem] [&_ul]:text-[#a9a7b2]">
            <span className="method-number pt-2.5 text-[0.7rem] text-[#9d89c6] tabular-nums">
              02
            </span>
            <div>
              <h3>Follow time.</h3>
              <p>
                An epoch is an observation date. Step through the demo timeline to explore how a
                sequence of observations is organized.
              </p>
            </div>
            <ul>
              <li>Step, scrub, or play the timeline</li>
              <li>Adjust playback speed</li>
              <li>Demo metadata, clearly labeled</li>
            </ul>
          </article>
          <article className="method-row laptop:grid-cols-[40px_1fr_0.8fr] laptop:gap-5.5 tablet:grid-cols-[35px_1fr] tablet:gap-4.5 mobile:px-0 mobile:py-7.5 mobile:[&_h3]:text-[1.8rem] tablet:[&_p]:max-w-none mobile:[&_p]:text-[0.8rem] laptop:[&_ul]:pl-3.75 tablet:[&_ul]:col-2 tablet:[&_ul]:p-0 grid grid-cols-[60px_1fr_0.75fr] gap-9 px-0 py-10 [border-top:1px_solid_var(--line)] [&_h3]:font-[Georgia,serif] [&_h3]:text-[2rem] [&_h3]:font-normal [&_h3]:tracking-[-0.02em] [&_li]:px-0 [&_li]:py-3.75 [&_li]:[border-bottom:1px_solid_var(--line)] [&_li:before]:mr-3.5 [&_li:before]:text-[0.75rem] [&_li:before]:text-[#8a739f] [&_li:before]:[content:'↗'] [&_p]:mt-3.5 [&_p]:max-w-120 [&_p]:text-[0.85rem] [&_p]:leading-[1.9] [&_p]:text-[#9a9aa3] [&_ul]:m-0 [&_ul]:list-none [&_ul]:p-[0_0_0_40px] [&_ul]:text-[0.75rem] [&_ul]:text-[#a9a7b2]">
            <span className="method-number pt-2.5 text-[0.7rem] text-[#9d89c6] tabular-nums">
              03
            </span>
            <div>
              <h3>Look for change.</h3>
              <p>
                With aligned images of the same field, astronomers can look for motion and
                brightness changes. This is the next step for Parallax.
              </p>
            </div>
            <ul>
              <li>Compare the same region and band</li>
              <li>Align images before subtraction</li>
              <li>Overlay and difference tools are planned</li>
            </ul>
          </article>
        </div>
      </section>
      <section
        id="perspective"
        className="perspective-section landing-section laptop:gap-8.75 tablet:grid-cols-[1fr] tablet:gap-8.75 tablet:px-0 tablet:py-18.75 grid scroll-mt-7.5 grid-cols-[1fr_1fr] items-center gap-17.5 px-0 py-27.5 [border-top:1px_solid_var(--line)]"
        aria-labelledby="perspective-title"
      >
        <div>
          <p className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
            02 / A change in perspective
          </p>
          <h2
            className="display-heading mobile:text-[2.65rem] mt-5.5 font-[Georgia,'Times_New_Roman',serif] text-[clamp(2.6rem,4.6vw,4.2rem)] leading-[1.1] font-normal tracking-[-0.035em] [&_em]:font-normal [&_em]:text-[#b5a0e5]"
            id="perspective-title"
          >
            Same sky.
            <br />
            <em>A different point of view.</em>
          </h2>
          <p className="section-body mobile:text-[0.85rem] mt-6.5 max-w-132.5 text-[0.95rem] leading-[1.9] text-[#9a9aa3]">
            As Earth moves around the Sun, nearby objects appear to shift against more distant
            stars. That apparent shift is called parallax—the idea behind our name.
          </p>
          <a
            href="#explorer"
            className="text-link mt-7 inline-flex items-center gap-6 text-[0.75rem] text-[#c1b1e5] [&:hover]:text-(--accent)"
          >
            Find your perspective <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div
          className="parallax-sketch tablet:m-auto tablet:w-full tablet:max-w-140 px-0 py-6.25 [&_p]:mt-5 [&_p]:text-center [&_p]:text-[0.6rem] [&_p]:tracking-[0.04em] [&_p]:text-[#77737f] [&_svg]:h-auto [&_svg]:w-full"
          role="img"
          aria-label="Schematic of two observing positions looking toward a nearby star against distant background stars"
        >
          <svg viewBox="0 0 560 320" aria-hidden="true">
            <g fill="#9a9aa3">
              <circle cx="85" cy="50" r="2" />
              <circle cx="210" cy="50" r="3" />
              <circle cx="350" cy="50" r="2" />
              <circle cx="475" cy="50" r="3" />
            </g>
            <path
              d="M145 265L280 140L415 50M415 265L280 140L145 50"
              stroke="#a78bfa"
              strokeWidth="1"
              strokeDasharray="5 5"
              fill="none"
            />
            <ellipse cx="280" cy="265" rx="137" ry="24" stroke="#4a4658" fill="none" />
            <circle cx="280" cy="265" r="5" fill="#e4e4e7" />
            <circle cx="145" cy="265" r="5" fill="#a78bfa" />
            <circle cx="415" cy="265" r="5" fill="#a78bfa" />
            <circle cx="280" cy="140" r="7" fill="#c4b5fd" />
            <g fill="#9a9aa3" fontSize="10" letterSpacing="1.5">
              <text x="188" y="23">
                DISTANT BACKGROUND
              </text>
              <text x="303" y="145">
                NEARBY OBJECT
              </text>
              <text x="104" y="310">
                POSITION A
              </text>
              <text x="374" y="310">
                POSITION B
              </text>
            </g>
          </svg>
          <p>Illustration only · distances are not to scale</p>
        </div>
      </section>
    </>
  );
}

export function Mission() {
  return (
    <section
      id="mission"
      className="landing-section mission-section tablet:px-6 tablet:py-16.25 mobile:mb-15 mobile:px-4.5 mobile:py-13.75 mobile:[&_>_.display-heading]:text-[2.6rem] mx-0 mt-12.5 mb-22.5 scroll-mt-7.5 rounded-xl bg-[#141418d9] px-7.5 py-25 text-center [border:1px_solid_var(--line)] [&_>_.action-primary]:mt-2 [&_>_.display-heading]:text-[clamp(2.6rem,4.5vw,4rem)] [&_>_p.mission-disclosure.mission-disclosure]:mb-0 [&_>_p.mission-disclosure.mission-disclosure]:text-[0.65rem] [&_>_p.mission-disclosure.mission-disclosure]:text-[#807b88] [&_>_p:not(.eyebrow)]:mx-auto [&_>_p:not(.eyebrow)]:my-6.5 [&_>_p:not(.eyebrow)]:max-w-145 [&_>_p:not(.eyebrow)]:text-[0.85rem] [&_>_p:not(.eyebrow)]:leading-[1.9] [&_>_p:not(.eyebrow)]:text-[#9a9aa3]"
    >
      <p className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
        04 / The mission ahead
      </p>
      <h2 className="display-heading mobile:text-[2.65rem] mt-5.5 font-[Georgia,'Times_New_Roman',serif] text-[clamp(2.6rem,4.6vw,4.2rem)] leading-[1.1] font-normal tracking-[-0.035em] [&_em]:font-normal [&_em]:text-[#b5a0e5]">
        A sky full of questions.
        <br />
        <em>A place to start looking.</em>
      </h2>
      <p>
        Parallax is an independent concept inspired by the NASA Space Apps SPHEREx challenge.
        Explore real SPHEREx imagery from IRSA, browse its wavelength layers, and find spectral
        exposures for your coordinates.
      </p>
      <a
        className="action-primary inline-flex min-h-12 items-center justify-center gap-6.25 rounded-[7px] bg-(--accent) px-5.5 py-3.75 text-[0.8rem] leading-[1.3] font-medium text-[#110d1b] [border:1px_solid_var(--accent)] [transition:background_0.2s,border-color_0.2s] [&:hover]:border-[#bda6fb] [&:hover]:bg-[#bda6fb] [&:hover]:text-[#110d1b]"
        href="#explorer"
      >
        Return to the explorer <span aria-hidden="true">↗</span>
      </a>
      <p className="mission-disclosure">
        No NASA affiliation or endorsement. SPHEREx data served by Caltech/IPAC IRSA.
      </p>
    </section>
  );
}
