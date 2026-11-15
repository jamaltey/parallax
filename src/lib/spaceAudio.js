// Sci-fi "galaxy far away" sound effects synthesized with the Web Audio API (no audio files).
// Droid chirps for stars and buttons, a soft blaster for atlas clicks, a saber-like power hum
// for the sound toggle. One shared AudioContext, created after the first user gesture.

const STORAGE_KEY = 'parallax:sound';
const MASTER_VOLUME = 0.4; // hard cap; individual effects stay well below full scale
const MAX_VOICES = 4;
const THROTTLE_MS = 80;
const ECHO_TIME = 0.24;
const ECHO_FEEDBACK = 0.3;

// Major pentatonic over three octaves from A3: any overlap stays consonant.
const PENTATONIC = [0, 2, 4, 7, 9];
const SCALE = Array.from(
  { length: 15 },
  (_, i) => 220 * 2 ** ((PENTATONIC[i % 5] + 12 * Math.floor(i / 5)) / 12)
);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const noteAt = t => SCALE[Math.round(clamp(t, 0, 1) * (SCALE.length - 1))];

let ctx = null;
let master, echo, tone; // tone = shared lowpass that takes the edge off square/saw waves
let voices = []; // end times (AudioContext seconds) of sounds still ringing
let lastSound = 0;
const listeners = new Set();

let enabled = true;
try {
  enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
} catch {
  /* storage unavailable */
}

function setup() {
  if (ctx) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  ctx = new AudioCtx();
  master = ctx.createGain();
  master.gain.value = MASTER_VOLUME;
  // Limiter: catches peaks when several sounds overlap, so the louder level never distorts.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  master.connect(limiter).connect(ctx.destination);

  tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3200;
  tone.Q.value = 0.5;
  tone.connect(master);

  // Small echo: a single delay line with light feedback, mixed in quietly.
  echo = ctx.createDelay(1);
  echo.delayTime.value = ECHO_TIME;
  const feedback = ctx.createGain();
  feedback.gain.value = ECHO_FEEDBACK;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(tone);
}

function unlock() {
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
  if (!enabled) return;
  setup();
  if (!document.hidden) ctx?.resume().catch(() => {});
}

function visibility() {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else if (enabled) ctx.resume().catch(() => {});
}

/** Runs fn once audio can play. queue=true waits for a pending resume (used for clicks). */
function play(fn, length, queue = false) {
  if (!enabled || !ctx || document.hidden) return;
  const now = performance.now();
  if (now - lastSound < THROTTLE_MS) return;
  const run = () => {
    voices = voices.filter(end => end > ctx.currentTime);
    if (voices.length >= MAX_VOICES) return;
    lastSound = now;
    voices.push(ctx.currentTime + length);
    fn(ctx.currentTime);
  };
  if (ctx.state === 'running') run();
  else if (queue) ctx.resume().then(run, () => {});
}

/** One oscillator with a pitch path, an envelope and a pan; disconnects itself when done. */
function blip({ type, at, length, path, peak, pan = 0, wet = true, attack = 0.006, vibrato = 0 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(path[0], at);
  path
    .slice(1)
    .forEach((hz, i, rest) =>
      osc.frequency.exponentialRampToValueAtTime(hz, at + (length * (i + 1)) / rest.length)
    );
  if (vibrato) {
    // Pitch wobble: an LFO adding ±vibrato fraction of the base frequency.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const depth = ctx.createGain();
    depth.gain.value = path[path.length - 1] * vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + length + 0.02);
    lfo.onended = () => {
      lfo.disconnect();
      depth.disconnect();
    };
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(peak, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  const panner = ctx.createStereoPanner();
  panner.pan.value = clamp(pan, -1, 1);
  osc.connect(env).connect(panner);
  panner.connect(tone);
  if (wet) panner.connect(echo);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
    panner.disconnect();
  };
  osc.start(at);
  osc.stop(at + length + 0.02);
}

// Small deterministic RNG: the same seed always yields the same sequence.
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0) / 4294967296;
}

// Consonant pentatonic steps (in scale degrees) for the chirp's later notes.
const STAR_STEPS = [-2, -1, 1, 2, 3, 5];

// Clearly different star "instruments". Each star is assigned one, so neighbours sound distinct.
// layers: [wave, frequency ratio, relative level, length factor]
const STAR_INSTRUMENTS = [
  // Bell: sine plus inharmonic partials, rings longer.
  {
    layers: [
      ['sine', 1, 1, 1],
      ['sine', 2.76, 0.35, 0.5],
      ['sine', 5.4, 0.15, 0.3],
    ],
    length: 0.6,
    peak: 0.75,
  },
  // Flute: triangle with a soft attack and light vibrato.
  { layers: [['triangle', 1, 1, 1]], length: 0.4, peak: 0.85, attack: 0.04, vibrato: 0.012 },
  // Pluck: bright sawtooth, very short (shared lowpass keeps it soft).
  { layers: [['sawtooth', 1, 1, 1]], length: 0.18, peak: 0.4 },
  // Chime: sine with octave and twelfth, airy.
  {
    layers: [
      ['sine', 1, 1, 1],
      ['sine', 2, 0.4, 0.7],
      ['sine', 3, 0.2, 0.5],
    ],
    length: 0.45,
    peak: 0.7,
  },
  // Retro: hollow square, short.
  { layers: [['square', 1, 1, 1]], length: 0.15, peak: 0.3 },
  // Wobble: sine with a wide, dreamy vibrato.
  { layers: [['sine', 1, 1, 1]], length: 0.5, peak: 0.85, attack: 0.02, vibrato: 0.03 },
];

/**
 * Star hover. tone 0 (red) … 1 (blue) sets the first pentatonic note. id picks the star's
 * instrument and a unique 1–3 note phrase (steps, bend, length, spacing). pan -1…1.
 */
export function playStar(starTone, pan = 0, id = 0) {
  const rand = seeded(hash(`star:${id}`));
  const inst = STAR_INSTRUMENTS[Math.floor(rand() * STAR_INSTRUMENTS.length)];
  let degree = Math.round(clamp(starTone, 0, 1) * (SCALE.length - 1));
  const count = 1 + Math.floor(rand() * 3); // 1–3 notes
  const steps = Array.from({ length: count }, (_, i) => {
    if (i) degree = clamp(degree + STAR_STEPS[Math.floor(rand() * STAR_STEPS.length)], 0, 14);
    const f = SCALE[degree];
    const bend = 0.96 + rand() * 0.08; // gentle bend into the note
    return { f, from: f * bend, length: inst.length * (0.8 + rand() * 0.4) };
  });
  const spacing = 0.08 + rand() * 0.06;
  const total = spacing * (count - 1) + Math.max(...steps.map(s => s.length));
  play(at => {
    steps.forEach((s, i) => {
      const t = at + spacing * i;
      const peak = inst.peak * 0.75 ** i;
      inst.layers.forEach(([type, ratio, level, lengthFactor], layer) =>
        blip({
          type,
          at: t,
          length: s.length * lengthFactor,
          path: [s.from * ratio, s.f * ratio],
          peak: peak * level,
          pan,
          wet: layer === 0, // only the main layer feeds the echo
          attack: inst.attack,
          vibrato: inst.vibrato,
        })
      );
    });
  }, total);
}

/** Catalog marker hover in the atlas: a clean double "targeting computer" beep. */
export function playScan(level = 0.5, pan = 0) {
  const f = noteAt(0.55 + level * 0.4);
  play(at => {
    blip({ type: 'sine', at, length: 0.06, path: [f], peak: 0.35, pan, wet: false });
    blip({ type: 'sine', at: at + 0.09, length: 0.08, path: [f], peak: 0.3, pan });
  }, 0.2);
}

/** Atlas click: a soft blaster "pew" falling in pitch, panned to the click position. */
export function playBlaster(pan = 0) {
  play(
    at => {
      blip({ type: 'sawtooth', at, length: 0.22, path: [1600, 520, 140], peak: 0.22, pan });
      blip({ type: 'sine', at, length: 0.18, path: [2400, 300], peak: 0.18, pan, wet: false });
    },
    0.25,
    true
  );
}

// Deterministic per-label RNG so every distinct button keeps its own signature phrase.
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Button press: a short droid "word" (2–4 chirps) generated from the button's identity. */
export function playButton(key, pan = 0) {
  let seed = hash(key) || 1;
  const rand = () => (seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0) / 4294967296;
  const count = 2 + Math.floor(rand() * 3);
  const type = ['square', 'triangle', 'sawtooth'][Math.floor(rand() * 3)];
  const steps = Array.from({ length: count }, () => {
    const f = SCALE[3 + Math.floor(rand() * 11)];
    const glide = 0.7 + rand() * 0.9; // <1 swoops up into the note, >1 swoops down
    return { f, from: f * glide, length: 0.045 + rand() * 0.05 };
  });
  const total = steps.reduce((sum, s) => sum + s.length + 0.025, 0);
  play(
    at => {
      let t = at;
      for (const s of steps) {
        blip({ type, at: t, length: s.length, path: [s.from, s.f], peak: 0.14, pan, wet: false });
        t += s.length + 0.025;
      }
    },
    total,
    true
  );
}

/** Saber-like power hum for the sound toggle: rising on, falling off. */
function playPower(on) {
  const path = on ? [70, 110, 98] : [110, 60];
  const length = on ? 0.55 : 0.4;
  const run = at => {
    blip({ type: 'sawtooth', at, length, path, peak: 0.2, wet: false });
    blip({ type: 'sawtooth', at, length, path: path.map(f => f * 1.01), peak: 0.16, wet: false });
  };
  if (on) play(run, length, true);
  else if (ctx?.state === 'running') {
    lastSound = 0;
    voices = [];
    run(ctx.currentTime);
    const context = ctx;
    setTimeout(() => !enabled && context.suspend().catch(() => {}), 600);
  }
}

// Every clickable control gets its own sound, keyed by its label and location.
const CLICKABLE =
  'button, [role="button"], a[href], summary, input[type="checkbox"], input[type="radio"]';
function controlClick(event) {
  const el = event.target instanceof Element && event.target.closest(CLICKABLE);
  if (!el || el.closest('[data-sound="off"]') || el.disabled) return;
  const label =
    el.getAttribute('aria-label') ||
    el.title ||
    el.textContent.trim() ||
    el.getAttribute('href') ||
    '';
  const area = el.closest('[data-tour], section[id], nav, dialog');
  const where = area ? area.dataset.tour || area.id || area.tagName : '';
  const box = el.getBoundingClientRect();
  playButton(`${where}|${label}`, ((box.left + box.width / 2) / window.innerWidth) * 1.4 - 0.7);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('click', controlClick, true);
}

export const isSoundEnabled = () => enabled;

export function setSoundEnabled(on) {
  enabled = Boolean(on);
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage unavailable */
  }
  if (enabled) {
    unlock(); // the toggle click is itself a user gesture
    playPower(true);
  } else playPower(false);
  listeners.forEach(fn => fn(enabled));
}

export function onSoundChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
