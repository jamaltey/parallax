import { useEffect, useRef, useState } from 'react';
import { isSoundEnabled, onSoundChange, playStar, setSoundEnabled } from '../lib/spaceAudio';

const STEPS = [
  {
    title: 'Welcome to Parallax',
    text: 'You do not need to be an astronomer. Parallax helps you look at real infrared images of the sky, compare when they were taken, and share anything interesting with other people.',
    tip: 'In this tour: choose a place → find images → compare them → mark an object → share with Community.',
  },
  {
    target: 'coordinates',
    title: '1. Choose a place in the sky',
    text: 'RA and Dec are the sky’s version of longitude and latitude. FOV means “field of view”—a larger number shows more sky. You can keep the starting values and select Explore coordinates.',
    tip: 'Not sure what to enter? The starting position is near the Crab Nebula and is ready to use.',
  },
  {
    target: 'samples',
    title: '2. Explore the infrared sky',
    text: 'Drag the map to move and use the + and − buttons to zoom. The colours show infrared brightness, not the colours your eyes would see. Try another wavelength to reveal different details.',
    tip: 'The large sky map combines images from different times. Use it to choose a location; use individual observations for marking and comparison.',
  },
  {
    target: 'samples',
    title: '3. Find real observations',
    text: 'Select Find images here. Parallax asks NASA’s SPHEREx archive for individual images that cover this position. Add the results to the timeline to browse them with one slider.',
    tip: 'An observation is one image taken at a particular time and infrared detector band. Archive outages can sometimes make a search temporarily unavailable.',
  },
  {
    target: 'timeline',
    title: '4. Travel through the images',
    text: 'Move the timeline slider or select Play images to switch between observation dates. Parallax preloads the selected results, so revisiting a ready image should be quick.',
    tip: 'A change in appearance can come from time, wavelength, image coverage, or an artifact. It is a clue to investigate—not proof of a discovery.',
  },
  {
    target: 'compare',
    title: '5. Compare and mark what you see',
    text: 'Choose two timeline images as A and B, then use Overlay, Blink, or Difference to look for change. Return to Original view, select Mark Object, and click the object. Mark it again in another observation if it moved.',
    tip: 'Your markers use sky coordinates, so earlier markers remain visible while you inspect another image. You can reposition or remove them before reporting.',
  },
  {
    target: 'sound',
    title: 'Listen to the stars',
    text: 'Parallax creates star sounds live in your browser with the Web Audio API—there are no prerecorded audio files. Hover over a background star, or aim the map’s centre reticle at a catalogued star, to hear a short note and soft echo. Use the Sound button in the corner to switch this on or off; your choice is remembered.',
    tip: 'Browsers allow sound only after your first click or key press. Parallax keeps the sound gentle by limiting how many notes can play together and how quickly new notes begin.',
    lab: 'first',
  },
  {
    title: 'Colour becomes pitch',
    text: 'A star’s colour tells astronomers about its surface temperature. Cool red stars, such as class M stars near 3,000 K, play lower notes. Hot blue stars, such as classes O and B above roughly 10,000 K, play higher notes. The notes use a five-note pentatonic scale so nearby stars still sound harmonious.',
    tip: 'When Parallax identifies a real star on the map, its colour comes from the star’s spectral type in the SIMBAD catalogue. The Sun, for example, is a G-type star.',
    lab: 'colour',
  },
  {
    title: 'Every star has its own voice',
    text: 'Parallax gives each star one of six sounds—bell, flute, pluck, chime, retro, or wobble—and a short phrase of one to three notes. Both are calculated from the star’s identity, so the same star keeps the same voice while neighbouring stars can sound different.',
    tip: 'Background stars also sound farther left or right depending on where they appear on your screen.',
    lab: 'voice',
  },
  {
    target: 'atlas',
    title: 'Aim the reticle at a star',
    text: 'The crosshair in the centre of the sky map is the reticle. Stop moving the map with a star beneath it and Parallax asks the SIMBAD catalogue what is there. A catalogued star plays its sound after a short delay; galaxies, nebulae, and empty sky stay quiet. Move away and return if you want to hear the star again.',
    tasks: [
      'Enter RA 88.79 and Dec 7.41 for Betelgeuse, a cool red supergiant. Explore, then gently move the map until the reticle rests on it. Listen for a low note.',
      'Next enter RA 78.63 and Dec −8.20 for Rigel, a hot blue supergiant. Does it sound higher?',
      'Return to Betelgeuse. Its sound should be the same as before because its voice comes from its identity.',
      'Move the reticle to empty sky. Silence can simply mean there is no catalogued star at that point.',
    ],
    tip: 'A catalogue match provides helpful context, but it does not prove that the catalogue object is the exact source visible in a SPHEREx image.',
  },
  {
    title: '6. Share with the Community',
    text: 'When your marked image is ready, select Report candidate. Describe what changed and choose your confidence. Your report appears in Community, where other people can reopen the same original observations and make an independent assessment.',
    tip: 'A Candidate needs further investigation. Community agreement is helpful discussion, but it is not scientific confirmation and does not mean an object is Planet X.',
  },
];

const labButton =
  'rounded-md bg-[#ffffff0d] px-3 py-1.5 text-[0.75rem] text-[#ececef] [border:1px_solid_#ffffff30] hover:border-[#a78bfa88] hover:text-[#c4b5fd]';

function SoundLab({ kind }) {
  const [on, setOn] = useState(isSoundEnabled);
  useEffect(() => onSoundChange(setOn), []);
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
            Mini task: these stars share one colour, but two are the same star. Which two?
          </strong>
          <div className="flex flex-wrap gap-2">
            {voiceIds.map((voice, index) =>
              button(`▶ Star ${index + 1}`, () => playStar(0.5, 0, `tour|voice-${voice}`))
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
              ? 'Correct! A higher note represents a hotter, bluer star.'
              : 'Correct! The same star keeps the same instrument and phrase.'
            : 'Not quite. Listen again and try once more.'}
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
        {STEPS[step].tip && (
          <p className="mt-4 rounded-lg border border-violet-300/20 bg-violet-300/5 p-3.5 text-violet-100!">
            <strong>Good to know:</strong> {STEPS[step].tip}
          </p>
        )}
        {STEPS[step].lab && <SoundLab key={step} kind={STEPS[step].lab} />}
        {step === STEPS.length - 1 && (
          <a className="mt-3 inline-block text-sm text-violet-300 underline" href="/community">
            Visit Community ↗
          </a>
        )}
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
