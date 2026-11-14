import { useEffect, useRef, useState } from 'react';

const STEPS = [
  {
    target: 'coordinates',
    title: 'Choose a patch of sky',
    text: 'RA and Dec locate a point in the sky, in degrees. Field of view sets how much sky you see. Enter values and select Explore coordinates to navigate.',
  },
  {
    target: 'samples',
    title: 'Choose your image',
    text: 'The real SPHEREx DR1 mosaic opens by default. Select a wavelength to change its image layer, or search IRSA for exposures at your applied coordinates. Change sky map also offers local Horsehead and 2MASS samples and the DSS2 reference sky.',
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
    title: 'Know what comes next',
    text: 'Overlay and Difference are interface placeholders. Scientific comparison needs aligned images of the same field and band. Your current sample image and settings stay unchanged during this tour.',
  },
];

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
    const target = document.querySelector(`[data-tour="${STEPS[step].target}"]`);
    if (!target) return;
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
