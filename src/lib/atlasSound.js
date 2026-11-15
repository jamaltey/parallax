// Sound + visual feedback for the Aladin Lite atlas.
import { isSoundEnabled, playBlaster, playScan, playStar } from './spaceAudio';
import { identifyObject } from '../api/objects';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const panFor = (el, x) => (el?.clientWidth ? (x / el.clientWidth) * 2 - 1 : 0);

/** Atlas click: soft blaster + a thin ring that expands and fades within 1 s. */
export function atlasClick(skyEl, x, y) {
  if (!skyEl || !Number.isFinite(x) || !Number.isFinite(y)) return;
  playBlaster(panFor(skyEl, x));
  const host = skyEl.parentElement; // the relatively positioned .viewer section
  const ring = document.createElement('span');
  ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, {
    position: 'absolute',
    left: `${skyEl.offsetLeft + x}px`,
    top: `${skyEl.offsetTop + y}px`,
    width: '160px',
    height: '160px',
    margin: '-80px 0 0 -80px',
    border: '1px solid #c4b5fd',
    borderRadius: '50%',
    pointerEvents: 'none',
    zIndex: '20',
  });
  host.appendChild(ring);
  const frames = reduceMotion()
    ? [
        { opacity: 0.6, transform: 'scale(0.3)' },
        { opacity: 0, transform: 'scale(0.3)' },
      ]
    : [
        { opacity: 0.7, transform: 'scale(0.05)' },
        { opacity: 0, transform: 'scale(1)' },
      ];
  ring.animate(frames, { duration: 1000, easing: 'ease-out' }).onfinish = () => ring.remove();
}

// Logs the fields of the first hovered catalog source once, to see what data exists.
let logged = false;

/** Catalog marker hover (image markers, reporter markers, SIMBAD result). */
export function atlasHover(skyEl, source, point) {
  if (!source) return;
  if (import.meta.env.DEV && !logged) {
    logged = true;
    console.log('[atlas] hovered source fields:', Object.keys(source.data || {}), source);
  }
  // Marker sources carry no color/spectral data, so pitch follows the marker group.
  const name = source.catalog?.name || '';
  const level = /SIMBAD/i.test(name)
    ? 1
    : /Current/i.test(name)
      ? 0.7
      : /Reporter/i.test(name)
        ? 0.2
        : 0.45;
  // Each source gets its own instrument and phrase, keyed by its sky position.
  const id = Number.isFinite(source.ra) ? `${source.ra.toFixed(6)},${source.dec.toFixed(6)}` : null;
  if (id) playStar(level, panFor(skyEl, point?.x), `${name}|${id}`);
  else playScan(level, panFor(skyEl, point?.x));
}

// Spectral class → star colour → pitch: O/B (blue, high) … K/M (red, low).
const SPECTRAL_CLASSES = 'OBAFGKM';

/** "G2V" → 0..1 tone (1 = hottest/bluest), or null when there is no usable spectral type. */
export function spectralTone(spectralType) {
  const match = /^(?:sd|d|sg|g)?([OBAFGKM])(\d(?:\.\d+)?)?/i.exec((spectralType || '').trim());
  if (!match) return null;
  const position = SPECTRAL_CLASSES.indexOf(match[1].toUpperCase()) + Number(match[2] ?? 5) / 10;
  return Math.min(1, Math.max(0, 1 - position / SPECTRAL_CLASSES.length));
}

const AIM_SETTLE_MS = 250;

/**
 * Plays a star's sound when the atlas reticle (view centre) comes to rest on it.
 * The object under the reticle is identified with SIMBAD; its spectral type sets the pitch.
 */
export function atlasAim(atlas) {
  let timer,
    controller,
    lastName = null;

  async function aim() {
    if (!isSoundEnabled()) return;
    controller?.abort();
    controller = new AbortController();
    try {
      const [rawRa, dec] = atlas.getRaDec();
      const ra = ((rawRa % 360) + 360) % 360;
      // Match radius ≈ the reticle's size on screen, within the lookup service's limits.
      const radius = Math.min(0.1, Math.max(2 / 3600, atlas.getFov()[0] / 60));
      const object = await identifyObject({ ra, dec, radius, signal: controller.signal });
      if (object.name === lastName) return; // still aimed at the same star
      lastName = object.name;
      const tone = spectralTone(object.spectralType);
      // Only stars: SIMBAD star types contain "*" (e.g. *, V*, PM*, **), or have a spectral type.
      if (tone === null && !object.objectType.includes('*')) return;
      playStar(tone ?? 0.5, 0, `simbad|${object.name}`);
    } catch (error) {
      if (error.name !== 'AbortError') lastName = null; // empty sky or lookup failure
    }
  }

  atlas.on('positionChanged', () => {
    clearTimeout(timer);
    timer = setTimeout(aim, AIM_SETTLE_MS);
  });
}
