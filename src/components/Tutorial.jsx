import { useEffect, useRef, useState } from 'react';
import { isSoundEnabled, onSoundChange, playStar, setSoundEnabled } from '../lib/spaceAudio';

const STEPS = [
  {
    target: 'coordinates',
    title: 'Choose a patch of sky',
    text: 'RA and Dec locate a point in the sky, in degrees. Field of view sets how much sky you see. Enter values and select Explore coordinates to navigate.',
  },
  {
    target: 'samples',
    title: 'Choose your image',
    text: 'The real SPHEREx DR1 mosaic opens by default. Select a wavelength to change its image layer. Search IRSA for original exposures at your applied coordinates. Change sky map also offers local Horsehead and 2MASS samples and the DSS2 reference sky.',
  },
  {
    target: 'atlas',
    title: 'Make yourself at home',
    text: 'Drag the sky to look around and scroll over the atlas to zoom. Its own coordinate and layer controls stay available. Each local image has a limited footprint.',
  },
  {
    target: 'timeline',
    title: 'Compare real observations',
    text: 'Open an image from the archive results to start your timeline. Return to the sky map to add more images, then use the arrows or Play to switch between them. Each date belongs to a real SPHEREx observation. Different wavelengths can also change how an object looks.',
  },
  {
    target: 'compare',
    title: 'Compare two observations',
    text: 'Open two real images, choose reference A and comparison B, then use aligned overlay, blink, or B − A residuals. Return to Original view before placing or confirming a marker.',
  },
  {
    target: 'sound',
    title: 'Listen to the stars',
    text: 'Every sound here is synthesized live in your browser with the Web Audio API. There are no audio files. Hover a background star, or rest the atlas reticle on a catalogued star, and it plays a short note with a soft echo. The Sound button in the corner switches this on or off, and your choice is remembered. Browsers only allow sound after your first click or key press. To keep things gentle, at most 4 sounds ring at once, and new ones start at least 80 ms apart.',
    lab: 'first',
  },
  {
    title: 'Colour becomes pitch',
    text: 'A star’s colour shows how hot its surface is. Red stars (class M, about 3,000 K) are cool, and blue stars (classes O and B, 10,000 K and more) are hot. Pitch follows the same order: red plays low, blue plays high. Notes always come from a five-note pentatonic scale, so stars sounding together stay in harmony. In the atlas, the colour comes from the star’s real spectral type in the SIMBAD catalogue (the Sun, for example, is G2).',
    lab: 'colour',
  },
  {
    title: 'Every star has its own voice',
    text: 'Each star gets one of six instruments (bell, flute, pluck, chime, retro or wobble) and its own phrase of 1–3 notes. Both are worked out from the star’s identity, so a star always sounds the same and its neighbours sound different. Background stars also play from the left or right speaker, depending on where they are on screen.',
    lab: 'voice',
  },
  {
    target: 'atlas',
    title: 'Aim the reticle at a star',
    text: 'The crosshair in the middle of the atlas is the reticle. When you stop moving the sky with a star under it, the app looks the object up in SIMBAD and plays that star. Expect a short delay while the catalogue answers. Only stars make sound; galaxies, nebulae and empty sky stay quiet. A star won’t repeat until you aim somewhere else and come back. Try these after the tour:',
    tasks: [
      'Enter RA 88.79, Dec 7.41 (Betelgeuse, a cool red supergiant) and explore, then nudge the sky so the reticle settles on it. Listen for a low note.',
      'Now go to RA 78.63, Dec −8.20 (Rigel, a hot blue supergiant). Does it sound higher?',
      'Go back to Betelgeuse. Is its sound exactly the same as before?',
      'Drag to an empty patch of sky. Silence means there is no catalogued star under the reticle.',
    ],
  },
];

const labButton =
  'rounded-md bg-[#ffffff0d] px-3 py-1.5 text-[0.75rem] text-[#ececef] [border:1px_solid_#ffffff30] hover:border-[#a78bfa88] hover:text-[#c4b5fd]';

/** Tutorial sound demos and mini tasks. data-sound="off" stops the global button sound from
 * taking the 80 ms throttle slot right before the demo note. */
function SoundLab({ kind }) {
  const [on, setOn] = useState(isSoundEnabled);
  useEffect(() => onSoundChange(setOn), []);
  // Fresh random answer each time the step opens, so the quiz really needs listening.
  const [hotter] = useState(() => (Math.random() < 0.5 ? 'A' : 'B'));
  const [twin] = useState(() => ['1 & 2', '1 & 3', '2 & 3'][Math.floor(Math.random() * 3)]);
  const [answer, setAnswer] = useState(null);

  const voiceIds = { '1 & 2': ['c', 'c', 'b'], '1 & 3': ['c', 'b', 'c'], '2 & 3': ['b', 'c', 'c'] }[
    twin
  ];
  const colour = tone => () => playStar(tone, 0, 'tour|colour2');
  const button = (label, onClick) => (
    <button type="button" key={label} className={labButton} onClick={onClick}>
      {label}
    </button>
  );
  const choice = (label, correct) => button(label, () => setAnswer(correct ? 'right' : 'wrong'));

  return (
    <div
      data-sound="off"
      className="mt-4 grid gap-2.5 rounded-lg bg-[#ffffff08] p-3.5 text-[0.75rem] text-[#b1a8bd]"
    >
      {!on && (
        <p className="m-0!">Sound is off. {button('Turn sound on', () => setSoundEnabled(true))}</p>
      )}
      {kind === 'first' && (
        <>
          <strong className="text-[#ececef]">Mini task: hear your first star.</strong>
          <div className="flex flex-wrap gap-2">
            {button('▶ Play a star', () => playStar(0.6, 0, 'tour|first2'))}
          </div>
        </>
      )}
      {kind === 'colour' && (
        <>
          <div className="flex flex-wrap gap-2">
            {button('▶ Red (M)', colour(0.1))}
            {button('▶ Yellow (G)', colour(0.4))}
            {button('▶ Blue (B)', colour(0.85))}
          </div>
          <strong className="text-[#ececef]">Mini task: which mystery star is hotter?</strong>
          <div className="flex flex-wrap gap-2">
            {button('▶ Star A', colour(hotter === 'A' ? 0.9 : 0.15))}
            {button('▶ Star B', colour(hotter === 'B' ? 0.9 : 0.15))}
            {choice('A is hotter', hotter === 'A')}
            {choice('B is hotter', hotter === 'B')}
          </div>
        </>
      )}
      {kind === 'voice' && (
        <>
          <strong className="text-[#ececef]">
            Mini task: these stars share one colour, but two of them are the same star. Which two?
          </strong>
          <div className="flex flex-wrap gap-2">
            {voiceIds.map((v, i) =>
              button(`▶ Star ${i + 1}`, () => playStar(0.5, 0, `tour|voice-${v}`))
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {['1 & 2', '1 & 3', '2 & 3'].map(pair => choice(pair, pair === twin))}
          </div>
        </>
      )}
      {answer && (
        <p className="m-0!" role="status">
          {answer === 'right'
            ? kind === 'colour'
              ? 'Correct! A higher note means a hotter, bluer star.'
              : 'Correct! The same star always plays the same instrument and phrase.'
            : 'Not quite. Listen to each one again and try once more.'}
        </p>
      )}
    </div>
  );
}

export default function Tutorial({ onClose }) {
  const dialog = useRef(null);
  const previousFocus = useRef(document.activeElement);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  const next = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      previousFocus.current?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const target =
      STEPS[step].target && document.querySelector(`[data-tour="${STEPS[step].target}"]`);
    if (!target) {
      setRect(null); // no element to spotlight: show the card on its own
      next.current?.focus({ preventScroll: true });
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    function update() {
      const r = target.getBoundingClientRect();
      setRect({ left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 });
    }
    update();
    next.current?.focus({ preventScroll: true });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    observer.observe(target);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [step]);
  function advance() {
    if (step === STEPS.length - 1) onClose();
    else setStep(value => value + 1);
  }
  return (
    <dialog
      ref={dialog}
      className="tutorial-dialog fixed inset-0 z-100 m-0 h-full max-h-none w-full max-w-none overflow-hidden p-0 text-[#ececef] [background:transparent] [border:0] backdrop:[background:transparent]"
      aria-labelledby="tour-title"
      aria-describedby="tour-description"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={event => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          advance();
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          setStep(value => Math.max(0, value - 1));
        }
      }}
    >
      <div
        className="tour-spotlight pointer-events-none fixed rounded-[14px] shadow-[0_0_0_9999px_#08080adb] [border:1px_solid_#c4a5ff] [transition:top_0.15s,left_0.15s,width_0.15s,height_0.15s]"
        style={rect || { inset: 0 }}
        aria-hidden="true"
      />
      <div className="tour-card mobile:bottom-3 mobile:px-5 mobile:pt-11.25 mobile:pb-5 mobile:[&_h2]:text-[1.5rem] mobile:[&_p]:text-[0.76rem] fixed bottom-6 left-[50%] max-h-[calc(100svh-32px)] w-[min(440px,calc(100%-32px))] transform-[translateX(-50%)] overflow-auto rounded-xl bg-[#17151d] px-6 pt-12 pb-6 shadow-[0_18px_80px_#0008] [border:1px_solid_#44394f] [&_h2]:mx-0 [&_h2]:mt-4.5 [&_h2]:mb-3 [&_h2]:font-[Georgia,serif] [&_h2]:text-[1.65rem] [&_h2]:leading-[1.2] [&_h2]:tracking-[-0.02em] [&_p]:text-[0.8rem] [&_p]:leading-[1.8] [&_p]:text-[#b1a8bd]">
        <button
          className="tour-skip absolute top-2.5 right-3.5 p-1.25 text-[0.7rem] text-[#b2a9bf] [background:none] [border:0] [&_span]:ml-2 [&_span]:text-[16px] [&:hover]:text-[#ececef] [&:hover]:[background:none]"
          onClick={onClose}
        >
          Skip tour <span aria-hidden="true">×</span>
        </button>
        <div className="tour-progress flex items-center justify-between gap-4 [&_>_div]:flex [&_>_div]:gap-1.25 [&_i]:h-1.25 [&_i]:w-1.25 [&_i]:rounded-[50%] [&_i]:bg-[#49404f] [&_i.active]:bg-(--accent)">
          <span className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
            Quick tour / {step + 1} of {STEPS.length}
          </span>
          <div aria-hidden="true">
            {STEPS.map((_, index) => (
              <i key={index} className={index === step ? 'active' : ''} />
            ))}
          </div>
        </div>
        <h2 id="tour-title">{STEPS[step].title}</h2>
        <p id="tour-description">{STEPS[step].text}</p>
        {STEPS[step].tasks && (
          <ol className="mt-3 list-decimal pl-5 text-[0.76rem] leading-[1.7] text-[#b1a8bd] marker:text-(--accent)">
            {STEPS[step].tasks.map(task => (
              <li key={task}>{task}</li>
            ))}
          </ol>
        )}
        {STEPS[step].lab && <SoundLab key={step} kind={STEPS[step].lab} />}
        <div className="tour-actions mt-6 flex justify-between gap-3.5 [&_>_button]:min-h-11 [&_>_button]:px-5 [&_>_button]:py-3">
          <button
            className="action-outline inline-flex min-h-12 items-center justify-center gap-6.25 rounded-[7px] bg-[#0e0e1144] px-5.5 py-3.75 text-[0.8rem] leading-[1.3] font-medium text-[#ececef] [border:1px_solid_#ffffff30] [transition:background_0.2s,border-color_0.2s] [&:hover]:border-[#a78bfa88] [&:hover]:bg-[#a78bfa09] [&:hover]:text-[#c4b5fd]"
            onClick={() => setStep(value => value - 1)}
            disabled={step === 0}
          >
            Back
          </button>
          <button
            ref={next}
            className="action-primary inline-flex min-h-12 items-center justify-center gap-6.25 rounded-[7px] bg-(--accent) px-5.5 py-3.75 text-[0.8rem] leading-[1.3] font-medium text-[#110d1b] [border:1px_solid_var(--accent)] [transition:background_0.2s,border-color_0.2s] [&:hover]:border-[#bda6fb] [&:hover]:bg-[#bda6fb] [&:hover]:text-[#110d1b]"
            onClick={advance}
          >
            {step === STEPS.length - 1 ? 'Start exploring' : 'Next'}{' '}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}
