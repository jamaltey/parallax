import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareFitsBuffers, floatImageFits } from '../src/lib/compareFits.js';
import { isCurrentComparisonJob, overlayOpacities } from '../src/lib/comparison.js';
import { readHdus } from '../src/lib/fits.js';
import { celestialWcs } from '../src/lib/wcs.js';

const wrapDelta = (value, reference) => ((value - reference + 540) % 360) - 180;

function header({
  width = 21,
  height = 21,
  ra = 80,
  dec = 20,
  scale = 0.001,
  rotation = 0,
  sip = false,
  unit = 'MJy/sr',
} = {}) {
  const angle = (rotation * Math.PI) / 180;
  const result = {
    BITPIX: -32,
    NAXIS: 2,
    NAXIS1: width,
    NAXIS2: height,
    CRPIX1: (width + 1) / 2,
    CRPIX2: (height + 1) / 2,
    CRVAL1: ra,
    CRVAL2: dec,
    CTYPE1: sip ? 'RA---TAN-SIP' : 'RA---TAN',
    CTYPE2: sip ? 'DEC--TAN-SIP' : 'DEC--TAN',
    CD1_1: -scale * Math.cos(angle),
    CD1_2: scale * Math.sin(angle),
    CD2_1: scale * Math.sin(angle),
    CD2_2: scale * Math.cos(angle),
    BUNIT: unit,
  };
  if (sip)
    Object.assign(result, {
      A_ORDER: 2,
      B_ORDER: 2,
      A_2_0: 0.001,
      A_0_2: -0.0004,
      B_1_1: 0.0007,
    });
  return result;
}

function pixelsFromSky(h, functionAt) {
  const wcs = celestialWcs(h);
  const pixels = new Float32Array(h.NAXIS1 * h.NAXIS2);
  for (let y = 0; y < h.NAXIS2; y++)
    for (let x = 0; x < h.NAXIS1; x++) {
      const [ra, dec] = wcs.pixelToWorld(x, y);
      pixels[y * h.NAXIS1 + x] = functionAt(ra, dec, x, y);
    }
  return pixels;
}

function fits(h, pixels) {
  const buffer = floatImageFits(h, pixels, { unit: h.BUNIT });
  if (!String(h.CTYPE1).endsWith('-SIP')) return buffer;
  const hdu = readHdus(buffer)[0];
  const fields = { ...h };
  const encode = (key, value) => {
    const encoded = typeof value === 'string' ? `'${value}'` : String(value);
    return `${key.padEnd(8)}= ${encoded}`.padEnd(80).slice(0, 80);
  };
  const cards = [
    encode('SIMPLE', 'T'),
    ...Object.entries(fields).map(([key, value]) => encode(key, value)),
  ];
  cards.push('END'.padEnd(80));
  const text = cards.join('');
  const offset = Math.ceil(text.length / 2880) * 2880;
  const output = new ArrayBuffer(offset + Math.ceil((pixels.length * 4) / 2880) * 2880);
  new Uint8Array(output).fill(32, 0, offset);
  new Uint8Array(output).set(new TextEncoder().encode(text));
  const view = new DataView(output);
  for (let index = 0; index < pixels.length; index++)
    view.setFloat32(offset + index * 4, pixels[index], false);
  assert.equal(hdu.header.NAXIS1, h.NAXIS1);
  return output;
}

function outputPixels(buffer) {
  const hdu = readHdus(buffer)[0];
  const view = new DataView(buffer);
  return Array.from({ length: hdu.header.NAXIS1 * hdu.header.NAXIS2 }, (_, index) =>
    view.getFloat32(hdu.dataOffset + index * 4, false)
  );
}

const surface = (ra, dec) => 10 + wrapDelta(ra, 80) * 700 + (dec - 20) * 500;
const finite = values => values.filter(Number.isFinite);

test('identical aligned images produce zero raw and normalized differences', () => {
  const h = header();
  const a = fits(h, pixelsFromSky(h, surface));
  const result = compareFitsBuffers(a, a.slice(0));
  assert.ok(finite(outputPixels(result.rawFits)).every(value => Math.abs(value) < 1e-6));
  assert.ok(finite(outputPixels(result.normalizedFits)).every(value => Math.abs(value) < 1e-6));
});

test('raw difference sign is B minus A and reverses when observations are swapped', () => {
  const h = header();
  const base = pixelsFromSky(h, () => 5);
  const brighter = base.map(value => value + 2);
  const positive = finite(
    outputPixels(compareFitsBuffers(fits(h, base), fits(h, brighter)).rawFits)
  );
  const negative = finite(
    outputPixels(compareFitsBuffers(fits(h, brighter), fits(h, base)).rawFits)
  );
  assert.ok(positive.every(value => Math.abs(value - 2) < 1e-5));
  assert.ok(negative.every(value => Math.abs(value + 2) < 1e-5));
});

test('a moving synthetic source creates a negative earlier and positive later residual', () => {
  const h = header();
  const a = new Float32Array(h.NAXIS1 * h.NAXIS2);
  const b = new Float32Array(a.length);
  const center = 10 * h.NAXIS1 + 10;
  a[center] = 20;
  b[center + 2] = 20;
  const difference = outputPixels(compareFitsBuffers(fits(h, a), fits(h, b)).rawFits);
  assert.ok(difference[center] < -19.9);
  assert.ok(difference[center + 2] > 19.9);
});

for (const [name, aHeader, bHeader, tolerance] of [
  ['shifted reference positions', header(), header({ ra: 80.004, dec: 20.002 }), 0.02],
  ['different rotations', header({ rotation: 0 }), header({ rotation: 23 }), 0.02],
  ['different pixel scales', header({ scale: 0.001 }), header({ scale: 0.0008 }), 0.02],
  ['TAN-SIP distortion', header({ sip: true }), header({ sip: false }), 0.04],
])
  test(`${name} align on the common celestial grid`, () => {
    const a = fits(aHeader, pixelsFromSky(aHeader, surface));
    const b = fits(bHeader, pixelsFromSky(bHeader, surface));
    const values = finite(outputPixels(compareFitsBuffers(a, b).rawFits));
    assert.ok(values.length > 4);
    assert.ok(Math.max(...values.map(Math.abs)) < tolerance);
  });

test('non-overlap is rejected and partial overlap remains masked', () => {
  const aHeader = header();
  const a = fits(aHeader, pixelsFromSky(aHeader, surface));
  const far = header({ ra: 100 });
  assert.throws(() => compareFitsBuffers(a, fits(far, pixelsFromSky(far, surface))), /overlapping/);
  const shifted = header({ ra: 80.012 });
  const partial = compareFitsBuffers(a, fits(shifted, pixelsFromSky(shifted, surface)));
  assert.ok(partial.stats.overlapFraction > 0);
  assert.ok(partial.stats.overlapFraction < 0.7);
  assert.ok(outputPixels(partial.rawFits).some(Number.isNaN));
});

test('NaN pixels mask only affected interpolation neighborhoods', () => {
  const h = header();
  const aPixels = pixelsFromSky(h, surface);
  const bPixels = pixelsFromSky(h, surface);
  aPixels[10 * h.NAXIS1 + 10] = NaN;
  const difference = outputPixels(compareFitsBuffers(fits(h, aPixels), fits(h, bPixels)).rawFits);
  assert.ok(Number.isNaN(difference[10 * h.NAXIS1 + 10]));
  assert.ok(Number.isFinite(difference[2 * h.NAXIS1 + 2]));
});

test('RA wraparound aligns observations across zero degrees', () => {
  const sky = (ra, dec) => wrapDelta(ra, 0) * 100 + dec;
  const aHeader = header({ ra: 359.999, dec: 5 });
  const bHeader = header({ ra: 0.001, dec: 5 });
  const result = compareFitsBuffers(
    fits(aHeader, pixelsFromSky(aHeader, sky)),
    fits(bHeader, pixelsFromSky(bHeader, sky))
  );
  assert.ok(result.stats.validCount > 100);
  assert.ok(Math.max(...finite(outputPixels(result.rawFits)).map(Math.abs)) < 0.02);
});

test('normalization handles constant and zero-scale inputs without infinities', () => {
  const h = header();
  const a = fits(
    h,
    pixelsFromSky(h, () => 0)
  );
  const b = fits(
    h,
    pixelsFromSky(h, () => 7)
  );
  const result = compareFitsBuffers(a, b);
  assert.equal(result.stats.normalization.a.constant, true);
  assert.equal(result.stats.normalization.b.constant, true);
  assert.ok(finite(outputPixels(result.normalizedFits)).every(Number.isFinite));
});

test('raw subtraction is blocked for missing or incompatible physical units', () => {
  const aHeader = header({ unit: 'MJy/sr' });
  const bHeader = header({ unit: 'Jy/pixel' });
  const result = compareFitsBuffers(
    fits(aHeader, pixelsFromSky(aHeader, surface)),
    fits(bHeader, pixelsFromSky(bHeader, surface))
  );
  assert.equal(result.stats.rawCompatible, false);
  assert.equal(result.rawFits, null);
  assert.ok(result.normalizedFits instanceof ArrayBuffer);
});

test('overlay endpoints, stale-job guard, and original-byte preservation are deterministic', () => {
  assert.deepEqual(overlayOpacities(0), { a: 1, b: 0 });
  assert.deepEqual(overlayOpacities(100), { a: 1, b: 1 });
  assert.equal(isCurrentComparisonJob(4, 3), false);
  assert.equal(isCurrentComparisonJob(4, 4), true);
  const h = header();
  const a = fits(h, pixelsFromSky(h, surface));
  const b = fits(h, pixelsFromSky(h, surface));
  const beforeA = createHash('sha256').update(new Uint8Array(a)).digest('hex');
  const beforeB = createHash('sha256').update(new Uint8Array(b)).digest('hex');
  compareFitsBuffers(a, b);
  assert.equal(createHash('sha256').update(new Uint8Array(a)).digest('hex'), beforeA);
  assert.equal(createHash('sha256').update(new Uint8Array(b)).digest('hex'), beforeB);
});

test('TAN WCS center and inverse mapping agree with independent reference coordinates', () => {
  const h = header({ ra: 359.99, dec: 89, rotation: 17 });
  const wcs = celestialWcs(h);
  const center = wcs.pixelToWorld(h.CRPIX1 - 1, h.CRPIX2 - 1);
  assert.ok(Math.abs(wrapDelta(center[0], h.CRVAL1)) < 1e-12);
  assert.ok(Math.abs(center[1] - h.CRVAL2) < 1e-12);
  for (const point of [
    [0, 0],
    [10, 10],
    [20, 20],
    [4.25, 16.75],
  ]) {
    const world = wcs.pixelToWorld(...point);
    const pixel = wcs.worldToPixel(...world);
    assert.ok(Math.abs(pixel[0] - point[0]) < 1e-7);
    assert.ok(Math.abs(pixel[1] - point[1]) < 1e-7);
  }
});
